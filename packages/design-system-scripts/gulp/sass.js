'use strict';

const autoprefixer = require('autoprefixer');
const changed = require('gulp-changed');
const count = require('gulp-count');
const cssnano = require('cssnano');
const gulp = require('gulp');
const gulpIf = require('gulp-if');
const path = require('path');
const postcss = require('gulp-postcss');
const postcssImport = require('postcss-import');
const sass = require('gulp-sass');
const sourcemaps = require('gulp-sourcemaps');
const streamPromise = require('./common/streamPromise');
const { logData, logError, logTask } = require('./common/logUtil');

// The bulk of our Sass task. Transforms our Sass into CSS, then runs through
// a variety of postcss processes (inlining, prefixing, minifying, etc).
function compileSass(src, dest, includePaths, browserSync) {
  const envDev = process.env.NODE_ENV === 'development';

  const sassCompiler = sass({
    outputStyle: 'expanded',
    includePaths,
  }).on('error', function (err) {
    logError('sass', 'Error transpiling Sass!');
    logData(err.messageFormatted);
    this.emit('end');
  });

  const postcssPlugins = [
    postcssImport(), // inline imports
    autoprefixer(), // add any necessary vendor prefixes
    ...(!envDev ? [cssnano()] : []), // minify css
  ];

  let stream = gulp
    .src([`${src}/**/*.scss`, `!${src}/**/*.docs.scss}`])
    .pipe(
      changed(dest, {
        extension: '.css',
        // compare contents so files that import the updated file also get piped through
        hasChanged: changed.compareSha1Digest,
      })
    )
    .pipe(gulpIf(envDev, sourcemaps.init()))
    .pipe(sassCompiler)
    .pipe(gulpIf(envDev, sourcemaps.write()))
    .pipe(postcss(postcssPlugins))
    .pipe(
      count({
        message: `## Sass files processed in ${src}`,
        logger: (message) => logTask('👓 ', message),
      })
    )
    .pipe(gulp.dest(dest));

  if (browserSync) {
    // Auto-inject into docs
    stream = stream.pipe(
      browserSync.stream({
        once: true,
        match: '**/*.css',
      })
    );
  }

  return streamPromise(stream);
}

async function compileSourceSass(sourceDir, options, browserSync) {
  // 'styles' folder is renamed to 'css'
  const src = path.join(sourceDir, 'src', 'styles');
  const dest = path.join(sourceDir, 'dist', 'css');

  // The core CMSDS repo hoists deps using yarn workspaces, deps in the root `node_module`
  // A standard child DS will have `node_modules` at the root of the repo
  const nodeModuleRelativePath =
    options.core || options.monorepo
      ? path.resolve(sourceDir, '../../node_modules')
      : path.resolve(sourceDir, 'node_modules');
  const includePaths = [src, nodeModuleRelativePath];
  await compileSass(src, dest, includePaths, browserSync);
}

async function compileDocsSass(docsDir, options, browserSync) {
  const src = path.join(docsDir, 'src');
  const dest = path.join(docsDir, 'dist');

  // The core CMSDS repo hoists deps using yarn workspaces, deps in the root `node_module`
  // A standard child DS will not have `node_modules` in the docs dir, only at the root of the repo
  let nodeModuleRelativePath;
  if (options.core) {
    nodeModuleRelativePath = path.resolve(docsDir, '../../node_modules');
  } else if (options.monorepo) {
    nodeModuleRelativePath = path.resolve(docsDir, '../../../node_modules');
  } else {
    nodeModuleRelativePath = path.resolve(docsDir, '../node_modules');
  }
  const includePaths = [src, nodeModuleRelativePath];
  await compileSass(src, dest, includePaths, browserSync);
}

module.exports = {
  compileSourceSass,
  compileDocsSass,
};
