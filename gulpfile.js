var path = require('path');

var gulp = require('gulp');
var awspublish = require('gulp-awspublish');
//var imagemin = require('gulp-imagemin');
var gm = require('gulp-gm');


var config = require('./config');
var memo = require('./lib/gulp-memo');
var move = require('./lib/gulp-move');
var pdnSplit = require('./lib/gulp-pdn-split');

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
  var base = path.join('_memo', 'img');

  return gulp.src('screens/**/*.pdn')
  .pipe(memo('_memo/gulp-memo-split.json'))
  .pipe(pdnSplit('_memo/split'))
  .pipe(gm(function(gmfile) {
    try {
      return gmfile.trim();
    } catch(err) {
      if(err.code === 'ENOENT') {
        throw new Error('graphicsmagick must be installed and in the search path.');
      } else {
        throw err;
      }
    }

  }))
  .pipe(move(function(filepath) {
    filepath = filepath.split(path.sep).slice(2);
    filepath = ['cdn', 'img'].concat(filepath);
    filepath = filepath.join(path.sep);

    var dir = path.dirname(filepath);
    var name = path.basename(filepath);
    name = name.replace(layerMeta, '');
    return slugify(path.join(dir, name));
  }, base))
  .pipe(gulp.dest('cdn/img'));
});

gulp.task('images', function() {
  return gulp.src('screens/**/*.png')
  .pipe(memo('_memo/gulp-memo-img.json'))
  //.pipe(imagemin())
  .pipe(move(slugify))
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
