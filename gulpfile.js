var async = require('async');
var chalk = require('chalk');
var path = require('path');

var gulp = require('gulp');
var awspublish = require('gulp-awspublish');
var imagemin = require('gulp-imagemin');
var gm = require('gulp-gm');


var config = require('./config');
var memo = require('./lib/gulp-memo');
var move = require('./lib/gulp-move');
var pdnSplit = require('./lib/gulp-pdn-split');

var imageOpts = {
  optimizationLevel: 5,
  pngquant: true
};

var color = {
  plugin: chalk.green,
  path: chalk.magenta
};

function log() {
  var args = [].slice.apply(arguments);
  args.unshift('[' + color.plugin('gulp-pdn-split') + ']');
  console.log.apply(null, args);
}

function slugify(filepath) {
  var dir = path.dirname(filepath);
  var name = path.basename(filepath);
  name = name.toLowerCase();
  name = name.replace(/[ _:]/g, '-');
  name = name.replace(/--/g, '-');
  name = name.replace(/[^a-z0-9-.]/g, '');
  return path.join(dir, name);
}

gulp.task('split', function() {
  var layerMeta = /^[A-Za-z0-9-]+-[Ll]\d+[Nn]ormal\d+[VHvh]/;
  var base = path.join('_memo', 'split');
  var offsets = {};

  return gulp.src('screens/**/*.pdn')
  .pipe(memo('_memo/gulp-memo-split.json'))
  .pipe(pdnSplit('_memo/split'))
  .pipe(move(function(filepath) {
    var dir = path.dirname(filepath);
    var name = path.basename(filepath);
    name = name.replace(layerMeta, '');
    return slugify(path.join(dir, name));
  }, base))
  .pipe(gm(function(gmfile, done) {
    async.series([
      function trim(next) {
        gmfile = gmfile.trim();
        next(null, gmfile);
      },
      function getInfo(next) {
        gmfile.identify('%@', next);
      }
    ], function finished(err, results) {
      if(err) {
        return done(err);
      }

      var parsed = results[1].match(/(\d+)x(\d+)\+(\d+)\+(\d+)/);
      var filename = results[0].source;
      var offset = {x: parsed[3], y: parsed[4]};
      log('Trimmed', filename.replace(path.join(process.cwd(), path.sep), ''), offset);
      offsets[filename] = offset;
      done(null, results[0]);
    });
  }, {imageMagick: true}))
  .pipe(imagemin(imageOpts))
  .pipe(gulp.dest('cdn/img'));
});

gulp.task('images', function() {
  return gulp.src('screens/**/*.png')
  .pipe(memo('_memo/gulp-memo-img.json'))
  .pipe(move(slugify))
  .pipe(imagemin(imageOpts))
  .pipe(gulp.dest('cdn/img'));
});

gulp.task('js', function() {
  return gulp.src('js/**/*')
  .pipe(gulp.dest('cdn/js'));
});

gulp.task('build', ['split', 'images', 'js']);

gulp.task('publish', function() {
  var publisher = awspublish.create({
    key: config.aws.key,
    secret: config.aws.secret,
    bucket: 'broken-dolls'
  });


  var headers = {
    'Cache-Control': 'max-age=31560000, no-transform, public'
  };

  var pipeline = gulp.src('cdn/**/*')
  .pipe(publisher.publish(headers))
  .pipe(publisher.sync())
  .pipe(publisher.cache())
  .pipe(awspublish.reporter());

  return pipeline;
});

gulp.on('stop', function() {
  process.nextTick(function() {
    process.exit(0);
  });
});
