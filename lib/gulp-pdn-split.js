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

var color = {
  plugin: chalk.green,
  path: chalk.magenta
};

function log() {
  var args = [].slice.apply(arguments);
  args.unshift('[' + color.plugin('gulp-pdn-split') + ']');
  console.log.apply(null, args);
}

function getTmpDir(tmproot, file) {
  var name = path.basename(file.path, '.pdn');
  return path.join(tmproot, path.dirname(file.relative), name);
}

function getTmp(tmpdir, file) {
  return path.join(getTmpDir(tmpdir, file), path.basename(file.path, '.pdn') + '.tmpdn');
}

// Creates an unpack directory and writes the pdn into it.
function writeTmp(state, next) {
  mkdirp(state.tmpdir, function(err) {
    if(err && err.code !== 'EEXIST') {
      state.self.emit('error', new gutil.PluginError('gulp-pdn-split', 'Couldn\'t make temp directory: ' + err));
      return next(err);
    }

    fs.writeFile(state.tmp, state.pdn.contents, function(err) {
      return next(err);
    });
  });
}

// Creates a file system watcher to give feedback as layers are split.
function watchSplit(state, next) {
  var unpacked = {};
  (new gaze.Gaze(state.layerGlob, function(err, watcher) {
    if(err) {
      return next(err);
    }
    // Fixes linux bug where watcher does not properly initialize.
    state.watcher = watcher;
    watcher.add('dummy.png');
    next();
  }))
  .on('all', function(event, filepath) {
    console.log('watcher ALL', filepath);
    if(!filepath.match(/png$/)) { return; }
    if(unpacked[filepath]) { return; }
    unpacked[filepath] = true;
    var relative = filepath.replace(state.tmpdir + path.sep, '');
    log('Unpacked', color.path(relative));
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

// Deletes temp file and kills watcher.
function cleanTmp(state, next) {
  log('Closing watcher');
  //state.watcher.close();

  log('Deleting tmp');
  fs.unlink(state.tmp, next);
}

// Injects unpacked layers into stream.
function injectLayers(state, next) {
  log('Injecting split files into stream');
  gulp.src(state.layerGlob)
  .pipe(through.obj(function injectLayers(file, enc, done) {
    log('Injecting file', file.path);
    state.self.push(file);
    done();
  }, function finished() {
    next();
  }));
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

    var tmpdir = getTmpDir(tmproot, pdn);
    var tmp = getTmp(tmproot, pdn);
    var layerGlob = path.join(tmpdir, '*.png');

    var state = {
      pdn: pdn,
      tmp: tmp,
      tmpdir: tmpdir,
      layerGlob: layerGlob,
      self: this
    };

    log('Splitting file:', color.path(pdn.relative));

    async.applyEachSeries(
      [
        writeTmp,
        //watchSplit,
        dispatchSplitter,
        cleanTmp,
        injectLayers
      ],
      state,
      function finished(err) {
        log('Done splitting', state.pdn.relative);
        if(err) {
          state.self.emit('error', new gutil.PluginError('gulp-pdn-split', err));
          return done();
        }

        done();
      });
  }, function finished(done) {
    log('All PDNs split');
    done();
  });
};
