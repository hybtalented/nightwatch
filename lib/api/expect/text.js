/**
 * Checks if a an element contains the specified text.
 *
 * ```
 *    this.demoTest = function (client) {
 *      browser.expect.element('#main').text.to.equal('The Night Watch');
 *      browser.expect.element('#main').text.to.not.equal('The Night Watch');
 *      browser.expect.element('#main').text.to.equal('The Night Watch').before(100);
 *      browser.expect.element('#main').text.to.contain('The Night Watch');
 *      browser.expect.element('#main').text.to.match(/The\ Night\ Watch/);
 *    };
 * ```
 *
 * @constructor
 */
var util = require('util');
var events = require('events');
var BaseAssertion = require('./_baseAssertion.js');

function TextAssertion() {
  this.flag('textFlag', true);

  BaseAssertion.call(this);

  this.message = 'Expected element <%s> text to' + (this.negate ? ' not' : '');
  this.start();
}

util.inherits(TextAssertion, BaseAssertion);

TextAssertion.prototype.executeCommand = function(callback) {
  this.protocol.elementIdText(this.elementResult.ELEMENT, callback);
};


TextAssertion.prototype.elementFound = function() {
  if (this.retries > 0 && this.negate) {
    return;
  }

  if (this.passed && this.waitForMs) {
    var message = '';
    if (this.hasCondition()) {
      message = 'condition was met';
    }
    this.elapsedTime = this.getElapsedTime();
    this.messageParts.push(' - ' + message + ' in ' + this.elapsedTime + 'ms');
  }
};

TextAssertion.prototype.elementNotFound = function() {
  this.passed = false;
};

TextAssertion.prototype.retryCommand = function() {
  this.onPromiseResolved();
};

module.exports = TextAssertion;