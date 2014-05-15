# gulp-asset

Creates revision using md5 hash of file contents and replaces all occurances of path in referencing files. Also allows you to prefix asset urls for balancing across cdn domains. It will also ensure that a single file only ever comes from the one prefix so assets aren't double downloaded

## Install

Install with [npm](https://npmjs.org/)
	npm install --save-dev gulp-asset

## Usage

```javascript
var gulp = require('gulp');
var asset = require('gulp-asset');

asset.config({
	prefix: ['http://cdn1.google.com', 'http://cdn2.google.com']
});

gulp.task('default', function () {
    gulp.src('src/*.css')
        .pipe(asset.rev())
        .pipe(asset.replace())
        .pipe(gulp.dest('dist'));
});
```

## License

[MIT](http://opensource.org/licenses/MIT)