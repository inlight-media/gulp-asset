/**
 * gulp-asset
 *
 * Inspired by "gulp-rev" and "gulp-replace" modules, some of their code is used in this module.
 * This module was created as an adaptation to both create md5 revision files and replace
 * all "asset://" urls within the contents of the files with the new revision filenames.
 *
 * You should run .rev() on all tasks where you want a new filename to be created based on md5 hash of contents (ie, img, css, fonts, etc)
 * You should run .replace() on all tasks where you want them scanned for asset:// urls (ie, css, html, etc)
 */

var crypto = require('crypto');
var path = require('path');
var gutil = require('gulp-util');
var through = require('through2');
var fs = require('fs');
var _ = require('underscore');

// Use .config({}) command to modify these defaults
var defaults = {
	prefix: '', // can be string or array of different prefixes.
	src: 'src', // specify where your src code is located
	dest: 'dist', // specify where your src code is located
	assetPath: '/assets/', // specify where you
	// @TODO: In future these values could be determined from the size of the project directory
	interval: 100, // change the interval or repeat value for projects that are larger and take more time for all assets to complete
	repeat: 10,
	cleanup: true // true means it will clean old files when they are regenerated by new commands (helpful with 'watch' plugin)
};

// Create empty manifest to keep track of files being processed and their rev filename
var manifest = {};

// We define an index for use in giving manifest unique number that can
// then be modulus switched on if there are multiple prefix passed in
// This way the assets will always go to the same prefix url
var index = 0;

// Method to apply new configuration over the default.
var config = function(opts) {
	defaults = _.defaults(opts, defaults);
}

// Gets md5 from file contents and writes new filename with hash included to destinations
var rev = function() {
	return through.obj(function(file, enc, cb) {
		var originalPath = file.path;

		// Get hash of contents
		var hash = crypto.createHash('md5').update(file.contents.toString(), 'utf8').digest('hex').slice(0, 8);

		// Construct new filename
		var ext = path.extname(file.path);
		var filename = path.basename(file.path, ext) + '-' + hash + ext;
		file.path = path.join(path.dirname(file.path), filename);

		// Add to manifest
		var base = path.join(file.cwd, defaults.src);
		var key = originalPath.replace(base, '');

		// Check for existing value and whether cleanup is set
		var existing = manifest[key];
		if (existing && existing.file && defaults.cleanup) {
			// Delete the file
			fs.unlink(path.join(file.cwd, defaults.dest, existing.file));
		}

		// Finally add new value to manifest
		manifest[key] = {
			file: file.path.replace(base, ''),
			index: index++
		};

		// Return and continue
		this.push(file);
		cb();
	});
}

// Scans the contents of the file and replaces all asset:// urls with the correct revision url
var replace = function(opts) {
	opts = opts || {};
	var prefix = opts.prefix || defaults.prefix;
	var interval = opts.interval || defaults.interval;
	var repeat = opts.repeat || defaults.repeat;
	var assetPath = opts.assetPath || defaults.assetPath;
	return through.obj(function(file, enc, cb) {
		var newContents = file.contents;
		var _this = this;
		var completed = {};
		var repeats = 0;
		(function recurse() {
			var failed = repeats >= repeat;

			newContents = new Buffer(String(file.contents).replace(/\b((asset:\/\/?)[^'"\s()<>]+(?:\([\w\d]+\)|([\.\w+]|\/)))/ig, function(match) {
				completed[match] = false;
				// Replace placeholder with correct base
				var filepath = match.replace('asset://', assetPath);

				// Check if file already in manifest, if it is, use it
				var found = manifest[filepath];

				// Else wait for it
				if (!found) {
					// @TODO: We could insert a 404 url in here if "failed" is true, probs not needed though
					return match;
				}
				// Get output filename and index for use in switching between prefixes
				var output = found.file;
				var index = found.index;
				completed[match] = true;

				// Construct prefix either using array or string
				var pre = _.isArray(prefix) ? prefix[index % prefix.length] : prefix;
				var result = pre + (output || '');

				return result;
			}));

			// If all matches have been completely replaced, finish, else recurse
			if (_.indexOf(_.values(completed), false) == -1 || failed) {
				if (failed) {
					var errored = _.compact(_.map(completed, function(val, key) { return !val ? gutil.colors.red(key): undefined }));
					var fileName = path.basename(file.path);
					var message = gutil.colors.yellow(fileName) + ': Stalled or unable to process asset url: ' + errored.join(', ') + '. This can occur if the file doesn\'t exist or is very large and takes time to process. You can updated the "interval" option or the "repeats".';
					_this.emit('error', new gutil.PluginError('gulp-asset', message));
				}
				file.contents = newContents;
				_this.push(file);
				cb();
			} else {
				repeats++;
				setTimeout(recurse, interval);
			}
		})();
	});
}

module.exports = {
	config: config,
	rev: rev,
	replace: replace
};