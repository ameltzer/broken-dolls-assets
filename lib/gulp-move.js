var path = require('path');
var gutil = require('gulp-util');
var through = require('through2');
var chalk = require('chalk');

var color = {
  plugin: chalk.green,
  path: chalk.magenta
};

function log() {
  var args = [].slice.apply(arguments);
  args.unshift('[' + color.plugin('gulp-move') + ']');
  console.info.apply(null, args);
}

module.exports = function gulpMove(renamer, rebase) {
  var base;
  if(typeof rebase === 'string') {
    if(rebase.charAt(0) !== path.sep) {
      base = path.join(process.cwd(), rebase);
    } else {
      base = rebase;
    }
  }

  return through.obj(function doMove(file, enc, done) {
    if(file.isNull()) {
      this.push(file);
      return done();
    }

    if(file.isStream()) {
      return this.emit('error', new gutil.PluginError('gulp-move', 'streaming not supported'));
    }

    var oldPath = file.path.replace(file.cwd + path.sep, '');
    var newPath = renamer(oldPath);

    log(color.path(oldPath), '->', color.path(newPath));
    newPath = path.join(file.cwd, newPath);

    file.base = base || file.base;
    file.path = newPath;

    //     console.log('PTH', file.path);
    //     console.log('BSE', file.base);
    //     console.log('REL', file.relative);

    this.push(file);

    done();
  });
};
