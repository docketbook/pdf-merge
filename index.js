'use strict';

const fs          = require('fs');
const os          = require('os');
const tmp         = require('tmp');
const child       = require('child_process');
const Promise     = require('bluebird');
const PassThrough = require('stream').PassThrough;
const shellescape = require('shell-escape');

const execFile  = Promise.promisify(child.execFile);
const exec      = Promise.promisify(child.exec);
const readFile  = Promise.promisify(fs.readFile);
const writeFile = Promise.promisify(fs.writeFile);

const isWindows = os.platform() === 'win32';

function isBufferOutput(options) {
	return (options.output === Buffer || String(options.output).toUpperCase() === 'BUFFER');
}

function isStreamOutput(options) {
	return (options.output === PassThrough || ['STREAM', 'READSTREAM'].indexOf(String(options.output).toUpperCase()) !== -1);	
}

function isFileOutput(options) {
	return !isBufferOutput(options) && !isStreamOutput(options);
}

module.exports = (files, options) => new Promise((resolve, reject) => {
	if(!Array.isArray(files)) {
		reject(new TypeError('Expected files to be an array of paths to PDF files.'));

		return;
	}

	files = files.filter((file) => typeof file === typeof '');

	if(files.length === 0) {
		reject(new Error('No files were submitted for merging.'));

		return;
	}

	if((files.length === 1) && (files[0].indexOf('*') === -1)) {
		reject(new Error('You need at least two files in order to merge PDF documents.'));

		return;
	}

	options = Object.assign({
		libPath: 'pdftk',
		output:  Buffer,
	}, options);

	let tmpFilePath = isWindows
		? tmp.tmpNameSync()
		: shellescape([tmp.tmpNameSync()]);

	if (isFileOutput(options)) {
		tmpFilePath = isWindows
		? options.output
		: shellescape([options.output]);
	}

	const args = files.map((file) =>
		isWindows
			? file
			: shellescape([file.replace(/\\/g, '/')])
	).map((file) => 
		file.indexOf('*') !== -1
			? file.substring(1, file.length - 1)
			: file
	).concat(['cat', 'output', tmpFilePath]);

	const childPromise = (isWindows && options.libPath !== 'pdftk')
		? execFile(options.libPath, args)
		: exec(`${options.libPath} ${args.join(' ')}`);

	if (isFileOutput(options)) {
		return childPromise.then(resolve).catch(reject);
	}

	childPromise
		.then(() =>
			readFile(tmpFilePath)
		)
		.then((buffer) =>
			new Promise((resolve) => {
				fs.unlink(tmpFilePath, () => resolve(buffer));
			})
		)
		.then((buffer) => {
			if(isBufferOutput(options)) {
				return buffer;
			}

			if(isStreamOutput(options)) {
				const stream = new PassThrough();

				stream.end(buffer);

				return stream;
			}
		})
		.then(resolve)
		.catch(reject);
});