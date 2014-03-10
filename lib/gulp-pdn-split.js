var _ = require('underscore');
var async = require('async');
var fs = require('fs');
var futils = require('file');
var chokidar = require('chokidar');
var path = require('path');
var gutil = require('gulp-util');
var through = require('through2');
var spawn = require('child_process').spawn;
var ansi = require('simple-ansi');

var color = {
  plugin: ansi.green,
  path: ansi.magenta
};

function log() {
  var args = [].slice.apply(arguments);
  args.unshift('[' + color.plugin + 'gulp-pdn-split' + ansi.reset + ']');
  console.info.apply(null, args);
}

function getTmpDir(tmproot, file) {
  var name = path.basename(file.path, '.pdn');
  return path.join(tmproot, path.dirname(file.relative), name);
}

function getTmp(tmpdir, file) {
  return path.join(getTmpDir(tmpdir, file), path.basename(file.path, '.pdn') + '.tmpdn');
}

function splitTemp(pdn, tmproot, done, err) {
  if(err) {
    this.emit('error', new gutil.PluginError('gulp-pdn-split', 'error, couldn\'t make temp file: ' + err));
  }

  var self = this;
  var unpacked = [];
  var tmpdir = getTmpDir(tmproot, pdn);
  var tmp = getTmp(tmproot, pdn);


  // Sets up a watcher to give feedback as layers are split out.
  var watcher = chokidar.watch(tmpdir, {persistent: true, ignoreInitial: true});
  watcher.on('add', function(filepath) {
    var relativePath = filepath.replace(tmpdir + path.sep, '');
    log(' Unpacked', color.path + relativePath + ansi.reset);
    unpacked.push(filepath);
  });

  // Dispatches the splitter process (wine must be installed and it must be in search path.).
  var splitter = spawn('pdn2png.exe', ['-split', path.basename(tmp)], {cwd: tmpdir});
  splitter.on('close', function(/* code */) {
    watcher.close();

    fs.unlink(tmp, function finalize() {
      async.each(unpacked, function pumpLayersToStream(filepath, next) {
        var file = new gutil.File({
          cwd: pdn.cwd,
          path: filepath,
          base: path.join(pdn.cwd, tmproot),
          contents: fs.readFileSync(filepath)
        });

        self.push(file);
        next();

      }, function finished() {
        log('Done splitting', pdn.relative);
        done();
      });
    });
  });
}

module.exports = function gulpPDNSplit(tmproot) {
  return through.obj(function doPDNSplit(file, enc, done) {
    if(file.isNull()) {
      this.push(file);
      return done();
    }
    if(file.isStream()) {
      this.emit('error', new gutil.PluginError('gulp-pdn-split', 'streaming not supported'));
    }

    var tmpdir = getTmpDir(tmproot, file);
    var tmp = getTmp(tmproot, file);

    log('Splitting file:', color.path + file.relative + ansi.reset);

    var self = this;
    try {
      futils.mkdirsSync(tmpdir);
    } catch(err) {
      if(err.code !== 'EEXIST') {
        this.emit('error', new gutil.PluginError('gulp-pdn-split', 'Unable to create unpack directory: ' + err));
      }
    }

    fs.writeFile(tmp, file.contents, _.bind(splitTemp, self, file, tmproot, done));
  });
};
