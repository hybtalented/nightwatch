const Utils = require('../utils');
const TestResults = require('./results.js');
const SimplifiedReporter = require('./simplified.js');
const {Logger, Screenshots} = Utils;
const { ScreenshotsService } = require('../transport/services');

class Reporter extends SimplifiedReporter {
  /**
   *
   * @param {Array} tests
   * @param {SuiteRetries} suiteRetries
   * @param {Object} settings
   * @param {Object} addOpts
   */
  constructor({settings, tests, suiteRetries, addOpts = {}}) {
    super(settings);

    this.suiteRetries = suiteRetries;
    this.suiteName = addOpts.suiteName;
    this.testResults = new TestResults(tests, addOpts);
    this.currentContext = null;

    this.testResults.initCurrentTest({
      module: addOpts.moduleKey,
      testName: '',
      group: addOpts.groupName
    });
  }

  /**
   * This is the exported property on the Nightwatch api object, which is passed on to tests
   *
   * @return {null|object}
   */
  get currentTest() {
    if (!this.currentTestCase) {
      return null;
    }

    return {
      name: this.currentTestCase.testName,
      module: this.testResults.moduleKey,
      group: this.testResults.groupName,
      results: this.testResults.currentTestResult
    };
  }

  get currentTestCase() {
    return this.testResults.currentTest;
  }

  get unitTestsMode() {
    return this.currentContext ? this.currentContext.unitTestsMode : this.settings.unit_tests_mode;
  }

  get currentTestCasePassed() {
    return this.testResults.currentTestCasePassed;
  }

  get allTestsPassed() {
    return this.testResults.testsPassed();
  }

  /**
   * @param {Error} err
   *
   * @return {boolean}
   */
  shouldIncrementTotalCount(err) {
    let incrementTotalCount = err.incrementErrorCount || Utils.isUndefined(err.incrementErrorCount);
    let shouldRetryTestcase = this.currentTest && this.suiteRetries && this.suiteRetries.shouldRetryTest(this.currentTest.name);

    if (err.incrementErrorsNo || shouldRetryTestcase) {
      incrementTotalCount = false;
    }

    return incrementTotalCount;
  }

  /**
   * @param {TestCase} testcase
   * @param {Context} context
   */
  setCurrentTest(testcase, context) {
    this.currentContext = context;

    this.testResults.setCurrentTest(testcase);
  }

  setFileNamePrefix(prefix) {
    this.testResults.reportPrefix = prefix;
  }

  setElapsedTime() {
    this.testResults.setElapsedTime();
  }

  testSuiteFinished() {
    this.testResults.setTotalElapsedTime();
  }

  exportResults() {
    return this.testResults.export;
  }

  ////////////////////////////////////////////////////////////
  // Results logging
  ////////////////////////////////////////////////////////////
  /**
   * @param {Object} result
   */
  logAssertResult(result) {
    this.testResults.logAssertion(result);
  }

  registerPassed(message) {
    Logger.logDetailedMessage(`${Logger.colors.green(Utils.symbols.ok)} ${message}`);
    this.testResults.incrementPassedCount();
  }

  registerFailed(err) {
    this.testResults.setLastError(err).incrementFailedCount(this.shouldIncrementTotalCount(err));
  }

  registerTestError(err) {
    super.registerTestError(err);

    // connection Refused (ECONNREFUSED) errors will be incremented at a later stage
    const detailedLogging = err.detailedLogging || Utils.isUndefined(err.detailedLogging);

    if (this.shouldIncrementTotalCount(err) && detailedLogging) {
      let errorMessage = Utils.errorToStackTrace(err);
      this.testResults.addErrorMessage(errorMessage);
    }

    this.testResults.setLastError(err).incrementErrorCount(this.shouldIncrementTotalCount(err));
  }

  /**
   * Subtracts the number of passed assertions from the total assertions count
   */
  resetCurrentTestPassedCount() {
    let assertionsCount = this.testResults.currentTestResult.passed;

    this.testResults.subtractPassedCount(assertionsCount);
  }

  printTestResult() {
    let ok = false;
    if (this.testResults.currentTestCasePassed) {
      ok = true;
    }

    let elapsedTime = this.testResults.currentTestElapsedTime;
    let currentTestResult = this.testResults.currentTestResult;

    const Concurrency = require('../runner/concurrency/concurrency.js');
    const isChildProcess = Concurrency.isChildProcess();
    if (isChildProcess || !this.settings.detailed_output || this.unitTestsMode) {
      this.printSimplifiedTestResult(ok, elapsedTime, isChildProcess);

      return;
    }

    if (ok && currentTestResult.passed > 0) {
      Logger.logDetailedMessage(`\n${Logger.colors.green('OK.')} ${Logger.colors.green(currentTestResult.passed)} assertions passed. (${Utils.formatElapsedTime(elapsedTime, true)})`);
    } else if (ok && currentTestResult.passed === 0) {
      if (this.settings.start_session) {
        Logger.logDetailedMessage(Logger.colors.green('No assertions ran.\n'), 'warn');
      }
    } else {
      let failureMsg = this.getFailureMessage();
      Logger.logDetailedMessage(`\n${Logger.colors.red('FAILED:')} ${failureMsg} (${Utils.formatElapsedTime(elapsedTime, true)})`);
    }
  }

  /**
   * @param {boolean} ok
   * @param {number} elapsedTime
   * @param {boolean} isChildProcess
   */
  printSimplifiedTestResult(ok, elapsedTime, isChildProcess) {
    let result = [Logger.colors[ok ? 'green': 'red'](Utils.symbols[ok ? 'ok' : 'fail'])];
    if (!this.unitTestsMode) {
      if (isChildProcess) {
        result.push(Logger.colors.white(process.env.__NIGHTWATCH_ENV, Logger.colors.background.black));
      }

      result.push(Logger.colors.cyan('[' + this.suiteName + ']'));
    }

    let testName = this.testResults.currentTest.testName;
    result.push(ok ? testName: Logger.colors.red(testName));

    if (elapsedTime > 20) {
      result.push(Logger.colors.yellow('(' + Utils.formatElapsedTime(elapsedTime, true) + ')'));
    }

    console.log(result.join(' '));
    if (ok || !this.currentTest) {
      return;
    }

    let results = this.currentTest.results;
    if (this.unitTestsMode && results.lastError) {
      Logger.error(results.lastError);
    } else {
      Reporter.printAssertions(results);
    }
  }

  static printAssertions(testcase) {
    testcase.assertions.forEach(function(a) {
      if (a.failure !== false) {
        let message = a.stackTrace.split('\n');
        message.unshift(a.fullMsg);
        Utils.showStackTrace(message.join('\n'));
      }
    });
  }

  getFailureMessage() {
    let failureMsg = [];
    let currentTestResult = this.testResults.currentTestResult;

    if (currentTestResult.failed > 0) {
      failureMsg.push(`${Logger.colors.red(currentTestResult.failed)} assertions failed`);
    }

    if (currentTestResult.errors > 0) {
      failureMsg.push(`${Logger.colors.red(currentTestResult.errors)} errors`);
    }

    if (currentTestResult.passed > 0) {
      failureMsg.push(`${Logger.colors.green(currentTestResult.passed)} passed`);
    }

    if (currentTestResult.skipped > 0) {
      failureMsg.push(`${Logger.colors.blue(currentTestResult.skipped)} skipped`);
    }

    return failureMsg.join(', ').replace(/,([^,]*)$/g, function(p0, p1) {
      return ` and ${p1}`;
    });
  }

  ////////////////////////////////////////////////////////////
  // Screenshots
  ////////////////////////////////////////////////////////////
  /**
   * @deprecated only used by JSONWire
   * @param result
   * @param screenshotContent
   */
  saveErrorScreenshot(result, screenshotContent) {
    if (this.settings.screenshots.on_error && screenshotContent) {
      const prefix = `${this.currentTest.module}/${this.currentTest.name}`;
      const fileName = Screenshots.getFileName(prefix, true, this.settings.screenshots.path);

      // FIXME: make this async / handle callback
      Screenshots.writeScreenshotToFile(fileName, screenshotContent);

      this.testResults.logScreenshotFile(fileName);
    }
  }
  /**
   * @property check whether take screeenshot on assert failure
   */
  get shouldTakeFailureScreenshot() {
    return !this.unitTestsMode && this.settings.screenshots && this.settings.screenshots.enabled && this.settings.screenshots.on_failure;
  }
  async saveFailureScreenshot(isError) {
    if(this.shouldTakeFailureScreenshot) {
      const prefix = `${this.currentTest.module}/${this.currentTest.name}-test-${this.currentTest.results.tests}`;
      const fileName = Screenshots.getFileName(prefix, isError, this.settings.screenshots.path);
      this.testResults.logScreenshotFile(fileName);

      return new Promise((resolve) => {
        ScreenshotsService.saveScreenshot(fileName, resolve);
      });
     
    }
  }
}

module.exports = Reporter;
module.exports.Simplified = require('./simplified.js');
module.exports.GlobalReporter = require('./global-reporter.js');
