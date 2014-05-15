# gulp-asset

Gulp module for managing asset revisions and paths.

- Define assets in all resources using 'asset://' prefix. These will be replaced with correct paths.
- Adds revision hash using md5 hash of file contents
- Load balance assets across domains
- Use manifest file to access revision files within javascript
- Assets always loaded from same domain
- Detects broken asset urls during build process
- Template engine agnostic

Creates revision using md5 hash of file contents and replaces all occurances of path in referencing files. Also allows you to prefix asset urls for balancing across cdn domains. It will also ensure that a single file only ever comes from the one prefix so assets aren't double downloaded.

## Install

Install with [npm](https://npmjs.org/)

	npm install --save-dev gulp-asset

## Usage

	var gulp = require('gulp');
	var asset = require('gulp-asset');

	asset.config({
		prefix: ['http://cdn1.google.com', 'http://cdn2.google.com']
	});

	gulp.task('js', function () {
		gulp.src('src/assets/js/**/*.js')
			.pipe(asset.rev())
			.pipe(asset.replace())
			.pipe(gulp.dest('dist/assets/js'));
	});

## Examples

Example JavaScript file

	// You can explicitly use an asset:// string
	var image = 'asset://img/image.png';
	var font = 'asset://fonts/test.eot';

	// Or construct a path and use the window.__assets variable
	var key = 'asset://' + 'fonts/' + 'test' + '.eot';
	var font = window.__assets[key];

Example HTML file

	<img src="asset://img/image.png">

Example CSS file

	body {
		background: blue url('asset://img/image.png');
	}

## License

[MIT](http://opensource.org/licenses/MIT)
