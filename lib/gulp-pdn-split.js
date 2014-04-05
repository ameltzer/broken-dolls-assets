var fs = require('fs');
var futils = require('file');
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

module.exports = function gulpPDNSplit(tmproot) {
  return through.obj(function doPDNSplit(pdn, enc, done) {
    if(pdn.isNull()) {
      this.push(pdn);
      return done();
    }
    if(pdn.isStream()) {
      this.emit('error', new gutil.PluginError('gulp-pdn-split', 'Streaming not supported'));
    }

    var self = this;
    var tmpdir = getTmpDir(tmproot, pdn);
    var tmp = getTmp(tmproot, pdn);
    var layerGlob = path.join(tmpdir, '*.png');

    log('Splitting file:', color.path(pdn.relative));

    // Creates an unpack directory for the pdn.
    try {
      futils.mkdirsSync(tmpdir);
    } catch(err) {
      if(err.code !== 'EEXIST') {
        this.emit('error', new gutil.PluginError('gulp-pdn-split', 'Unable to create unpack directory: ' + err));
      }
    }

    // Writes the pdn to its unpack directory.
    try {
      fs.writeFileSync(tmp, pdn.contents);
    } catch(err) {
      this.emit('error', new gutil.PluginError('gulp-pdn-split', 'Couldn\'t make temp file: ' + err));
      return done();
    }

    // Creates a file system watcher to give feedback as layers are split.
    var watcher = gaze(layerGlob, function() {
      watcher.add('dummy');
    });

    var unpacked = {};
    watcher.on('all', function(event, filepath) {
      if(!filepath.match(/png$/)) { return; }
      if(unpacked[filepath]) { return; }
      unpacked[filepath] = true;
      var relative = filepath.replace(tmpdir + path.sep, '');
      log('Unpacked', color.path(relative));
    });
    watcher.on('error', function(err) {
      this.emit(new gutil.PluginError('gulp-pdn-split', 'Gaze watcher failed: ' + err));
      done();
    });


    // Dispatches the splitter process (wine must be installed and it must be in search path.).
    var splitter = spawn(path.join(__dirname, '..', 'bin/pdn2png.exe'), ['-split', path.basename(tmp)], {cwd: tmpdir});
    splitter.on('error', function(err) {
      this.emit(new gutil.PluginError('gulp-pdn-split', 'Splitter process failed: ' + err));
      done();
    });

    splitter.on('exit', function(code) {
      log('pdn2png exited with status:', code);
      // Delete temp file.
      try {
        log('Deleting tmp');
        fs.unlinkSync(tmp);
      } catch(err) {
        log('Failed to delete tmp');
        this.emit('error', new gutil.PluginError('gulp-pdn-split', 'error, couldn\'t delete temp file: ' + err));
        return done();
      }

      log('Closing watcher');
      watcher.close();


      // Inject unpacked layers into stream.
      log('Injecting split files into stream');
      gulp.src(layerGlob)
      .pipe(through.obj(function injectLayers(file, enc, done) {
        log('Injecting file', file.path);
        self.push(file);
        done();
      }, function finished() {
        log('Done splitting', pdn.relative);
        done();
      }));
    });
  });
};
