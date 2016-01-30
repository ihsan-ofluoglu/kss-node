// Remove after https://github.com/Constellation/doctrine/issues/100 is fixed.
/* eslint-disable valid-jsdoc */

'use strict';

/**
 * The `kss/generator/handlebars` module loads the kssHandlebarsGenerator
 * object, a `{@link KssGenerator}` object using Handlebars templating.
 * ```
 * const kssHandlebarsGenerator = require('kss/generator/handlebars');
 * ```
 * @module kss/generator/handlebars
 */

const KssGenerator = require('../kss_generator.js'),
  fs = require('fs-extra'),
  glob = require('glob'),
  marked = require('marked'),
  path = require('path');

// Pass a string to KssGenerator() to tell the system which API version is
// implemented by kssHandlebarsGenerator.
let kssHandlebarsGenerator = new KssGenerator('3.0', {
  'helpers': {
    group: 'Style guide:',
    string: true,
    path: true,
    describe: 'Location of custom handlebars helpers; see http://bit.ly/kss-wiki'
  },
  'homepage': {
    group: 'Style guide:',
    string: true,
    multiple: false,
    describe: 'File name of the homepage\'s Markdown file',
    default: 'homepage.md'
  },
  'placeholder': {
    group: 'Style guide:',
    string: true,
    multiple: false,
    describe: 'Placeholder text to use for modifier classes',
    default: '[modifier class]'
  },
  'nav-depth': {
    group: 'Style guide:',
    multiple: false,
    describe: 'Limit the navigation to the depth specified',
    default: 3
  }
});

/**
 * Initialize the style guide creation process.
 *
 * This method is given a configuration JSON object with the details of the
 * requested style guide generation. The generator can use this information for
 * any necessary tasks before the KSS parsing of the source files.
 *
 * @alias module:kss/generator/handlebars.init
 * @param {Object} config Configuration object for the requested generation.
 * @param {Function} cb Callback that will be given an Error as its first
 *                      parameter, if one occurs.
 * @returns {*} The callback's return value.
 */
kssHandlebarsGenerator.init = function(config, cb) {
  cb = cb || /* istanbul ignore next */ function() {};

  // Save the configuration parameters.
  this.config = config;
  this.config.helpers = this.config.helpers || [];

  // Store the global Handlebars object.
  this.Handlebars = require('handlebars');

  // Load the standard Handlebars helpers.
  require('./helpers.js').register(this.Handlebars, this.config);

  if (this.config.verbose) {
    this.log('');
    this.log('Generating your KSS style guide!');
    this.log('');
    this.log(' * KSS Source  : ' + this.config.source.join(', '));
    this.log(' * Destination : ' + this.config.destination);
    this.log(' * Template    : ' + this.config.template);
    if (this.config.helpers.length) {
      this.log(' * Helpers     : ' + this.config.helpers.join(', '));
    }
    this.log('');
  }

  // Create a new destination directory.
  try {
    fs.mkdirsSync(this.config.destination + '/kss-assets');
  } catch (e) {
    // empty
  }

  // Optionally, copy the contents of the template's "kss-assets" folder.
  fs.copy(
    this.config.template + '/kss-assets',
    this.config.destination + '/kss-assets',
    {
      clobber: true,
      filter: /^[^.]/
    },
    // If the template does not have a kss-assets folder, ignore the error.
    function() {}
  );

  // Load Handlebars helpers.
  if (this.config.helpers.length > 0) {
    for (let i = 0; i < this.config.helpers.length; i++) {
      if (fs.existsSync(this.config.helpers[i])) {
        // Load custom Handlebars helpers.
        let helperFiles = fs.readdirSync(this.config.helpers[i]);

        for (let j = 0; j < helperFiles.length; j++) {
          if (path.extname(helperFiles[j]) === '.js') {
            let helper = require(this.config.helpers[i] + '/' + helperFiles[j]);
            if (typeof helper.register === 'function') {
              helper.register(this.Handlebars, this.config);
            }
          }
        }
      }
    }
  }

  // Compile the Handlebars template.
  this.template = fs.readFileSync(this.config.template + '/index.html', 'utf8');
  this.template = this.Handlebars.compile(this.template);

  return cb(null);
};

/**
 * Generate the HTML files of the style guide given a KssStyleGuide object.
 *
 * @alias module:kss/generator/handlebars.generate
 * @param {KssStyleGuide} styleGuide The KSS style guide in object format.
 */
kssHandlebarsGenerator.generate = function(styleGuide, cb) {
  this.styleGuide = styleGuide;
  this.partials = {};

  let sections = this.styleGuide.sections(),
    sectionRoots = [];

  cb = cb || /* istanbul ignore next */ function() {};

  if (this.config.verbose && this.styleGuide.meta.files) {
    this.log(this.styleGuide.meta.files.map(file => {
      return ' - ' + file;
    }).join('\n'));
  }

  // Return an error if no KSS sections are found in the source files.
  let sectionCount = sections.length;
  if (sectionCount === 0) {
    return cb(Error('No KSS documentation discovered in source files.'));
  }

  if (this.config.verbose) {
    this.log('...Determining section markup:');
  }

  for (let i = 0; i < sectionCount; i += 1) {
    // Register all the markup blocks as Handlebars partials.
    if (sections[i].markup()) {
      let partial = {
        name: sections[i].reference(),
        reference: sections[i].reference(),
        file: '',
        markup: sections[i].markup(),
        data: {}
      };
      // If the markup is a file path, attempt to load the file.
      if (partial.markup.match(/^[^\n]+\.(html|hbs)$/)) {
        partial.file = partial.markup;
        partial.name = path.basename(partial.file, path.extname(partial.file));
        let files = [];
        for (let key in this.config.source) {
          if (!files.length) {
            files = glob.sync(this.config.source[key] + '/**/' + partial.file);
          }
        }
        // If the markup file is not found, note that in the style guide.
        if (!files.length) {
          partial.markup += ' NOT FOUND!';
          if (!this.config.verbose) {
            this.log('WARNING: In section ' + partial.reference + ', ' + partial.markup);
          }
        }
        if (this.config.verbose) {
          this.log(' - ' + partial.reference + ': ' + partial.markup);
        }
        if (files.length) {
          // Load the partial's markup from file.
          partial.file = files[0];
          partial.markup = fs.readFileSync(partial.file, 'utf8');
          // Load sample data for the partial from the sample .json file.
          if (fs.existsSync(path.dirname(partial.file) + '/' + partial.name + '.json')) {
            try {
              partial.data = require(path.dirname(partial.file) + '/' + partial.name + '.json');
            } catch (e) {
              partial.data = {};
            }
          }
        }
      } else if (this.config.verbose) {
        this.log(' - ' + partial.reference + ': inline markup');
      }
      // Register the partial using the filename (without extension) or using
      // the style guide reference.
      this.Handlebars.registerPartial(partial.name, partial.markup);
      // Save the name of the partial and its data for retrieval in the markup
      // helper, where we only know the reference.
      this.partials[partial.reference] = {
        name: partial.name,
        data: partial.data
      };
    }

    // Accumulate an array of section references for all sections at the root of
    // the style guide.
    let currentRoot = sections[i].reference().split(/(?:\.|\ \-\ )/)[0];
    if (sectionRoots.indexOf(currentRoot) === -1) {
      sectionRoots.push(currentRoot);
    }
  }

  // If a root element doesn't have an actual section, build one for it.
  // @TODO: Move this "fixing" into KssStyleGuide.
  let rootCount = sectionRoots.length;
  let newSection = false;
  for (let i = 0; i < rootCount; i += 1) {
    let currentRoot = this.styleGuide.sections(sectionRoots[i]);
    if (currentRoot === false) {
      // Add a section to the style guide.
      newSection = true;
      this.styleGuide
        .autoInit(false)
        .sections({
          header: sectionRoots[i],
          reference: sectionRoots[i]
        });
    }
  }
  // Re-init the style guide if we added new sections.
  if (newSection) {
    this.styleGuide.autoInit(true);
  }

  if (this.config.verbose) {
    this.log('...Generating style guide pages:');
  }

  // Now, group all of the sections by their root
  // reference, and make a page for each.
  rootCount = sectionRoots.length;
  for (let i = 0; i < rootCount; i += 1) {
    let childSections = this.styleGuide.sections(sectionRoots[i] + '.*');

    this.generatePage(sectionRoots[i], childSections);
  }

  // Generate the homepage.
  this.generatePage('styleGuide.homepage', []);

  cb(null);
};

/**
 * Creates a 2-level hierarchal menu from the style guide.
 *
 * @param {string} pageReference The reference of the root section of the page
 *   being generated.
 * @returns {Array} An array of menu items that can be used as a Handlebars
 *   variable.
 */
kssHandlebarsGenerator.createMenu = function(pageReference) {
  // Helper function that converts a section to a menu item.
  const toMenuItem = function(section) {
    // @TODO: Add an option to "include" the specific properties returned.
    let menuItem = section.toJSON();

    // Remove data we definitely won't need for the menu.
    delete menuItem.markup;
    delete menuItem.modifiers;
    delete menuItem.parameters;

    // Mark the current page in the menu.
    menuItem.isActive = (menuItem.reference === pageReference);

    // Mark any "deep" menu items.
    menuItem.isGrandChild = (menuItem.depth > 2);

    return menuItem;
  };

  // Retrieve all the root sections of the style guide.
  return this.styleGuide.sections('x').map(rootSection => {
    let menuItem = toMenuItem(rootSection);

    // Retrieve the child sections for each of the root sections.
    menuItem.children = this.styleGuide.sections(rootSection.reference() + '.*').slice(1).map(toMenuItem);

    // Remove menu items that are deeper than the nav-depth config setting.
    for (let i = 0; i < menuItem.children.length; i++) {
      if (menuItem.children[i].depth > this.config['nav-depth']) {
        delete menuItem.children[i];
      }
    }

    return menuItem;
  });
};

/**
 * Renders the handlebars template for a section and saves it to a file.
 *
 * @alias module:kss/generator/handlebars.generatePage
 * @param {string} pageReference The reference of the current page's root section.
 * @param {Array} sections An array of KssSection objects.
 */
kssHandlebarsGenerator.generatePage = function(pageReference, sections) {
  let filename = '',
    homepageText = false;

  if (pageReference === 'styleGuide.homepage') {
    filename = 'index.html';
    if (this.config.verbose) {
      this.log(' - homepage');
    }
    // Ensure homepageText is a non-false value.
    for (let key in this.config.source) {
      if (!homepageText) {
        try {
          let files = glob.sync(this.config.source[key] + '/**/' + this.config.homepage);
          if (files.length) {
            homepageText = ' ' + marked(fs.readFileSync(files[0], 'utf8'));
          }
        } catch (e) {
          // empty
        }
      }
    }
    if (!homepageText) {
      homepageText = ' ';
      if (this.config.verbose) {
        this.log('   ...no homepage content found in ' + this.config.homepage + '.');
      } else {
        this.log('WARNING: no homepage content found in ' + this.config.homepage + '.');
      }
    }
  } else {
    let rootSection = this.styleGuide.sections(pageReference);
    filename = 'section-' + rootSection.referenceURI() + '.html';
    if (this.config.verbose) {
      this.log(
        ' - section ' + pageReference + ' [',
        rootSection.header() ? rootSection.header() : 'Unnamed',
        ']'
      );
    }
  }

  // Create the HTML to load the optional CSS and JS.
  let styles = '',
    scripts = '';
  for (let key in this.config.css) {
    if (this.config.css.hasOwnProperty(key)) {
      styles = styles + '<link rel="stylesheet" href="' + this.config.css[key] + '">\n';
    }
  }
  for (let key in this.config.js) {
    if (this.config.js.hasOwnProperty(key)) {
      scripts = scripts + '<script src="' + this.config.js[key] + '"></script>\n';
    }
  }

  fs.writeFileSync(this.config.destination + '/' + filename,
    this.template({
      pageReference: pageReference,
      sections: sections.map(section => {
        return section.toJSON();
      }),
      menu: this.createMenu(pageReference),
      homepage: homepageText,
      styles: styles,
      scripts: scripts,
      hasNumericReferences: this.styleGuide.hasNumericReferences(),
      partials: this.partials,
      styleGuide: this.styleGuide,
      options: this.config || {}
    })
  );
};

module.exports = kssHandlebarsGenerator;
