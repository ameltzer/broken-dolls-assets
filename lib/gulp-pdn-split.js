var async = require('async');
var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');
var gaze = require('gaze');
var gulp = require('gulp');
var gutil = require('gulp-util');
var through = require('through2');
var spawn = require('child_process').spawn;
var chalk = require('chalk');
var prettyBytes = require('pretty-bytes');

var color = {
  plugin: chalk.green,
  path: chalk.magenta
};

function log() {
  var args = [].slice.apply(arguments);
  args.unshift('[' + color.plugin('gulp-pdn-split') + ']');
  console.log.apply(null, args);
}


// Creates an unpack directory and writes the pdn into it.
function writeTmp(state, next) {
  mkdirp(state.tmpdir, function(err) {
    if(err && err.code !== 'EEXIST') {
      state.self.emit('error', new gutil.PluginError('gulp-pdn-split', 'Couldn\'t make temp directory: ' + err));
      return next(err);
    }

    fs.writeFile(state.tmp, state.pdn.contents, function(err) {
      // Fixes linux bug where watcher does not properly initialize.
      fs.writeFile(state.dummy, null, function(err2) {
        return next(err || err2);
      });
    });
  });
}

// Injects unpacked layers into stream.
function injectLayers(filepath, state) {
  gulp.src(filepath, {base: state.tmproot})
  .pipe(through.obj(function injectLayers(file, enc, done) {
    log('Injecting', color.path(file.relative), chalk.gray(prettyBytes(file.contents.length)));
    state.self.push(file);
    done();
  }, function finished() {
    if(state.isDone) {
      log('### DONE', color.path(state.pdn.relative));
      state.done();
    }
  }));
}

// Creates a file system watcher to give feedback as layers are split.
function watchSplit(state, next) {
  var unpacked = {};
  state.last = null;
  (new gaze.Gaze(state.layerGlob, function(err, watcher) {
    if(err) {
      return next(err);
    }
    state.watcher = watcher;
    next();
  }))
  .on('added', function(filepath) {
    if(!filepath.match(/png$/)) { return; }
    if(filepath.match(state.dummy)) { return; }
    if(unpacked[filepath]) { return; }
    unpacked[filepath] = true;
    var relative = filepath.replace(process.cwd() + path.sep, '');
    log('Unpacking', color.path(relative));
    state.count++;

    if(state.last) {
      injectLayers(state.last, state);
    }
    state.last = relative;
  });
}

// Dispatches the splitter process (wine must be installed and it must be in search path.).
function dispatchSplitter(state, next) {
  var splitter = spawn(
    path.join(__dirname, '..', 'bin/pdn2png.exe'),
    ['-split', path.basename(state.tmp)], {cwd: state.tmpdir});
  splitter.on('error', function(err) {
    state.self.emit(new gutil.PluginError('gulp-pdn-split', 'Splitter process failed: ' + err));
    return next(err);
  });

  state.splitter = splitter;
  splitter.on('exit', next);
}

// Deletes temp file.
function cleanTmp(state, next) {
  fs.unlink(state.tmp, function(err) {
    fs.unlink(state.dummy, function(err2) {
      next(err || err2);
    });
  });
}


module.exports = function gulpPDNSplit(tmproot) {
  return through.obj(function doPDNSplit(pdn, enc, done) {
    if(pdn.isNull()) {
      this.push(pdn);
      return done();
    }
    if(pdn.isStream()) {
      this.emit('error', new gutil.PluginError('gulp-pdn-split', 'Streaming not supported'));
    }

    var name = path.basename(pdn.path, '.pdn');
    var tmpdir = path.join(tmproot, path.dirname(pdn.relative), name);
    var tmp = path.join(tmpdir, name + '.tmpdn');
    var layerGlob = path.join(tmpdir, '*');

    var state = {
      tmproot: tmproot,
      pdn: pdn,
      done: done,
      tmp: tmp,
      tmpdir: tmpdir,
      dummy: path.join(tmpdir, '$ $'),
      layerGlob: layerGlob,
      self: this
    };

    log('Splitting file:', color.path(pdn.relative));

    async.applyEachSeries(
      [
        writeTmp,
        watchSplit,
        dispatchSplitter,
        cleanTmp
      ],
      state,
      function finished(err) {
        state.watcher.close();
        if(err) {
          state.self.emit('error', new gutil.PluginError('gulp-pdn-split', err));
          return done();
        }

        state.isDone = true;
        if(state.last) {
          injectLayers(state.last, state);
        } else {
          log('Empty or Watcher Failed, Falling back.', color.path(state.pdn.relative));
          injectLayers(layerGlob, state);
        }
      });
  }, function finished(done) {
    log('#### All PDNs split ####');
    done();
  });
};
