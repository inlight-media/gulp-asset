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
var pkg = require('./package.json');
var version = pkg.version;

// Use .config({}) command to modify these defaults
var defaults = {
	prefix: '', // can be string or array of different prefixes.
	src: 'src', // specify where your src code is located
	dest: 'dist', // specify where your src code is located
	assetPath: '/assets/', // specify where you
	manifest: 'manifest.js', // filename format for saving the manifest file (a revision number will be put on it)
	globalVar: '__assets', // the global var to assign manifest to. It will attach it to the 'window' (ie, window.__assets).
	// @TODO: In future these values could be determined from the size of the project directory
	interval: 100, // change the interval or repeat value for projects that are larger and take more time for all assets to complete
	repeat: 10,
	cleanup: true, // true means it will clean old files when they are regenerated by new commands (helpful with 'watch' plugin)
	hash: true // enable/disable revision hashing. can be helpful during development if you don't want hashes in filenames
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

function md5(opts, str) {
	var shouldHash = typeof opts.hash != 'undefined' ? opts.hash : defaults.hash;
	return shouldHash ? crypto.createHash('md5').update(str, 'utf8').digest('hex').slice(0, 8) : undefined;
}

// Manifest file name creation
var manifestRev = md5({}, ('' + +(new Date())));
function manifestFileName(opts) {
	opts = opts || {};
	var ext = path.extname(defaults.manifest);
	var assetPath = (opts.assetPath || defaults.assetPath);
	var basePath = assetPath + path.basename(defaults.manifest).replace(ext, '');
	var output = typeof manifestRev !== 'undefined' ? basePath + '-' + manifestRev + ext : basePath + ext;
	return output;
};

// Setup method to write the manifest file. It uses a timeout to attempt to reduce
// number of writes that are performed.
var manifestTimeout;
function writeManifest() {
	if (manifestTimeout) {
		clearTimeout(manifestTimeout);
	}

	manifestTimeout = setTimeout(function() {
		var assets = {};
		_.keys(manifest).forEach(function(key) {
			assets[key] = manifest[key].dest;
		});

		var filepath = path.join(defaults.dest, manifestFileName());
		fs.writeFile(filepath, ';window.' + defaults.globalVar + ' = ' + JSON.stringify(assets) + ';');
	}, 200);
}

// Gets md5 from file contents and writes new filename with hash included to destinations
var rev = function(opts) {
	var opts = opts || {};
	var shouldHash = typeof opts.hash != 'undefined' ? opts.hash : defaults.hash;
	var prefix = _.flatten([defaults.prefix]);
	var shouldPrefix = typeof opts.shouldPrefix != 'undefined' ? opts.shouldPrefix : true;
	return through.obj(function(file, enc, cb) {
		var originalPath = file.path;

		// Get hash of contents
		var hash = md5(opts, file.contents.toString());

		// Construct new filename
		var ext = path.extname(file.path);
		var basePath = path.basename(file.path, ext);
		var filename = typeof hash !== 'undefined' ? basePath + '-' + hash + ext : basePath + ext;
		file.path = path.join(path.dirname(file.path), filename);

		// Add to manifest
		var base = path.join(file.cwd, defaults.src);
		var key = originalPath.replace(base, '');

		// @TODO: Instead of this it could use "glob" module to regex delete files
		// Check for existing value and whether cleanup is set
		var existing = manifest[key];
		if (existing && existing.src && defaults.cleanup) {
			// Delete the file
			fs.unlink(path.join(file.cwd, defaults.dest, existing.src));
		} else if (defaults.cleanup && shouldHash) {
			// Check if cleanup and hash enabled then we can remove any non hashed version from dest directory
			var nonHashPath = path.join(path.dirname(originalPath), basePath + ext).replace(base, '');
			var absPath = path.join(file.cwd, defaults.dest, nonHashPath);
			fs.exists(absPath, function(exists) {
				if (!exists) return;
				fs.unlink(absPath);
			});
		}

		var filePrefix = shouldPrefix ? prefix[index % prefix.length] : '';

		// Finally add new value to manifest
		var src = file.path.replace(base, '');
		manifest[key] = {
			index: index++,
			src: src,
			dest: filePrefix + src
		};

		// Write manifest file
		writeManifest();

		// Return and continue
		this.push(file);
		cb();
	});
}

// Scans the contents of the file and replaces all asset:// urls with the correct revision url
var replace = function() {
	var prefix = _.flatten([defaults.prefix]);
	var interval = defaults.interval;
	var assetPath = defaults.assetPath;

	return through.obj(function(file, enc, cb) {
		var newContents = file.contents;
		var _this = this;
		var completed = {};
		var repeats = 0;
		(function recurse() {
			var failed = repeats >= defaults.repeat;

			// Find how many are files are still missing from the manifest,
			// if some are missing don't continue, bypassing the regex should hopefully be a less expensive task
			if (!_.isEmpty(completed)) {
				var keys = _.keys(completed);
				var missing = 0;
				keys.forEach(function(key) {
					missing += typeof manifest[key] == 'undefined';
				});
				if (missing > 0 && !failed) {
					repeats++;
					setTimeout(recurse, interval);
					return;
				}
			}

			// If there are none missing then scan contents
			newContents = new Buffer(String(file.contents).replace(/\b((asset:\/\/?)[^#!%&*$?'"\s()<>]*(?:\([\w\d]*\)|([\.\w*]|\/)))/ig, function(match) {
				// Replace placeholder with correct base
				var filepath = match.replace('asset://', assetPath);

				// Handle matches where it is just the base protocol to replace
				// Useful for your javascript expressions wher url is constructed using expression
				if (match == 'asset://') {
					return filepath;
				}

				// If manifest then return special manifest path
				if (filepath == path.join(assetPath, defaults.manifest)) {
					return prefix[0] + manifestFileName(opts);
				}

				completed[filepath] = false;

				// Check if file already in manifest, if it is, use it
				var found = manifest[filepath];

				// Else wait for it
				if (!found) {
					// @TODO: We could insert a 404 url in here if "failed" is true, probs not needed though
					return match;
				}
				// Get output filename and index for use in switching between prefixes
				var output = found.dest;
				completed[filepath] = true;
				return output;
			}));

			// If all matches have been completely replaced, finish, else recurse
			if (_.indexOf(_.values(completed), false) == -1 || failed) {
				if (failed) {
					var errored = _.compact(_.map(completed, function(val, key) { return !val ? gutil.colors.red(key): undefined }));
					var fileName = path.join(file.path.replace(file.cwd, '').replace(defaults.src, defaults.dest));
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
	version: version,
	config: config,
	rev: rev,
	replace: replace
};