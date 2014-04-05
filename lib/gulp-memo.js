var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');
var crypto = require('crypto');
var gutil = require('gulp-util');
var through = require('through2');

module.exports = function gulpMemo(memoFile) {

  var memo;
  try {
    if(memoFile.charAt(0) === '.') {
      memo = require('.' + memoFile);
    }
    else if(memoFile.charAt(0) !== path.sep) {
      memo = require('..' + path.sep + memoFile);
    }
    else {
      memo = require(memoFile);
    }
  } catch(err) {
    if(err.code === 'MODULE_NOT_FOUND' || err.code === 'ENOENT') {
      memo = {};
    } else {
      throw new gutil.PluginError('gulp-memo', 'memo file must be a valid JSON file.');
    }
  }

  return through.obj(function doMemo(file, enc, done) {
    if(file.isNull()) {
      this.push(file);
      return done();
    }

    if(file.isStream()) {
      return this.emit('error', new gutil.PluginError('gulp-memo', 'streaming not supported'));
    }

    var hash = crypto.createHash('sha1');
    hash.setEncoding('hex');
    hash.write(file.contents);
    hash.end();
    hash = hash.read();

    var relativePath = file.path.replace(file.cwd + path.sep, '');

    if(memo[relativePath] !== hash) {
      memo[relativePath] = hash;
      this.push(file);
    }

    done();
  }, function finalize(done) {
    mkdirp(path.dirname(memoFile), function(err) {
      if(err) {
        this.emit(new gutil.PluginError('gulp-memo', err));
        return done();
      }

      fs.writeFile(memoFile, JSON.stringify(memo, null, 2), done);
    });
  });
};
