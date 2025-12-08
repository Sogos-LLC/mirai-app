/**
 * SCORM 2004 3rd Edition API Wrapper
 * Production-ready implementation for LMS communication.
 */
function SCORM2004Wrapper(options) {
  options = options || {};
  this.debug = options.debug || false;
  this.autocommitInterval = options.autocommitInterval || 60000;

  this.apiHandle = null;
  this.isInitialized = false;
  this.isTerminated = false;
  this.startTime = null;
  this.commitTimer = null;
  this.cache = {};
}

SCORM2004Wrapper.prototype.log = function(message, level) {
  if (this.debug) {
    if (level === 'error') {
      console.error('[SCORM] ' + message);
    } else {
      console.log('[SCORM] ' + message);
    }
  }
};

// API Discovery
SCORM2004Wrapper.prototype.findAPI = function(win) {
  var MAX_DEPTH = 500;
  var depth = 0;

  while (win.API_1484_11 == null && win.parent != null &&
         win.parent !== win && depth < MAX_DEPTH) {
    depth++;
    win = win.parent;
  }
  return win.API_1484_11;
};

SCORM2004Wrapper.prototype.getAPI = function() {
  if (this.apiHandle) return this.apiHandle;

  var api = null;

  if (window.parent && window.parent !== window) {
    api = this.findAPI(window.parent);
  }

  if (!api && window.opener) {
    api = this.findAPI(window.opener);
  }

  this.apiHandle = api;
  return api;
};

// Core API Methods
SCORM2004Wrapper.prototype.initialize = function() {
  if (this.isInitialized) {
    this.log('Already initialized', 'warn');
    return true;
  }

  var api = this.getAPI();
  if (!api) {
    this.log('API_1484_11 not found - running in standalone mode', 'warn');
    // Enable standalone mode for testing outside LMS
    this.isInitialized = true;
    this.startTime = new Date();
    return true;
  }

  var result = api.Initialize('');

  if (result === 'true') {
    this.isInitialized = true;
    this.startTime = new Date();
    this.log('Initialize successful');

    // Set initial status if first attempt
    var status = this.getValue('cmi.completion_status');
    if (status === 'not attempted' || status === 'unknown' || status === '') {
      this.setValue('cmi.completion_status', 'incomplete');
    }

    // Start autocommit timer
    this.startAutocommit();

    return true;
  }

  this.handleError('Initialize');
  return false;
};

SCORM2004Wrapper.prototype.terminate = function() {
  if (!this.isInitialized || this.isTerminated) {
    return false;
  }

  this.stopAutocommit();
  this.setSessionTime();
  this.commit();

  if (!this.apiHandle) {
    // Standalone mode
    this.isTerminated = true;
    this.isInitialized = false;
    return true;
  }

  var result = this.apiHandle.Terminate('');

  if (result === 'true') {
    this.isTerminated = true;
    this.isInitialized = false;
    this.log('Terminate successful');
    return true;
  }

  this.handleError('Terminate');
  return false;
};

SCORM2004Wrapper.prototype.getValue = function(element) {
  if (!this.isInitialized || this.isTerminated) return '';
  if (!this.apiHandle) return this.cache[element] || '';

  // Return cached read-only values
  if (this.cache[element] !== undefined && this.isReadOnly(element)) {
    return this.cache[element];
  }

  var value = this.apiHandle.GetValue(element);

  if (this.getLastError() === 0) {
    if (this.isReadOnly(element)) {
      this.cache[element] = value;
    }
    return value;
  }

  this.handleError('GetValue(' + element + ')');
  return '';
};

SCORM2004Wrapper.prototype.setValue = function(element, value) {
  if (!this.isInitialized || this.isTerminated) return false;

  value = String(value);

  if (!this.apiHandle) {
    // Standalone mode - just cache values
    this.cache[element] = value;
    this.log('SetValue (standalone): ' + element + ' = ' + value);
    return true;
  }

  var result = this.apiHandle.SetValue(element, value);

  if (result === 'true') {
    this.log('SetValue: ' + element + ' = ' + value);
    return true;
  }

  this.handleError('SetValue(' + element + ', ' + value + ')');
  return false;
};

SCORM2004Wrapper.prototype.commit = function() {
  if (!this.isInitialized || this.isTerminated) return false;
  if (!this.apiHandle) return true; // Standalone mode

  var result = this.apiHandle.Commit('');

  if (result === 'true') {
    this.log('Commit successful');
    return true;
  }

  this.handleError('Commit');
  return false;
};

// Error Handling
SCORM2004Wrapper.prototype.getLastError = function() {
  return this.apiHandle ? parseInt(this.apiHandle.GetLastError()) || 0 : 0;
};

SCORM2004Wrapper.prototype.getErrorString = function(code) {
  return this.apiHandle ? this.apiHandle.GetErrorString(String(code)) : '';
};

SCORM2004Wrapper.prototype.getDiagnostic = function(code) {
  return this.apiHandle ? this.apiHandle.GetDiagnostic(String(code)) : '';
};

SCORM2004Wrapper.prototype.handleError = function(context) {
  var code = this.getLastError();
  if (code !== 0) {
    var msg = this.getErrorString(code);
    var diag = this.getDiagnostic(code);
    this.log('Error in ' + context + ': [' + code + '] ' + msg + ' - ' + diag, 'error');
  }
};

// State Management
SCORM2004Wrapper.prototype.getSuspendData = function() {
  var raw = this.getValue('cmi.suspend_data');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
};

SCORM2004Wrapper.prototype.setSuspendData = function(data) {
  var json = JSON.stringify(data);
  if (json.length > 64000) {
    this.log('suspend_data exceeds 64000 char limit', 'error');
    return false;
  }
  return this.setValue('cmi.suspend_data', json);
};

SCORM2004Wrapper.prototype.saveState = function(updates) {
  var current = this.getSuspendData();
  for (var key in updates) {
    if (updates.hasOwnProperty(key)) {
      current[key] = updates[key];
    }
  }
  current._timestamp = Date.now();
  return this.setSuspendData(current);
};

SCORM2004Wrapper.prototype.loadState = function() {
  return this.getSuspendData();
};

SCORM2004Wrapper.prototype.isResumeSession = function() {
  return this.getValue('cmi.entry') === 'resume';
};

SCORM2004Wrapper.prototype.setBookmark = function(location) {
  return this.setValue('cmi.location', String(location));
};

SCORM2004Wrapper.prototype.getBookmark = function() {
  return this.getValue('cmi.location');
};

// Score Management
SCORM2004Wrapper.prototype.setScore = function(raw, min, max) {
  min = min !== undefined ? min : 0;
  max = max !== undefined ? max : 100;

  this.setValue('cmi.score.raw', String(raw));
  this.setValue('cmi.score.min', String(min));
  this.setValue('cmi.score.max', String(max));

  var scaled = (raw - min) / (max - min);
  this.setValue('cmi.score.scaled', scaled.toFixed(7));
};

// Completion
SCORM2004Wrapper.prototype.setComplete = function(passed) {
  passed = passed !== false;
  this.setValue('cmi.completion_status', 'completed');
  this.setValue('cmi.success_status', passed ? 'passed' : 'failed');
  this.setValue('cmi.exit', 'normal');
  this.commit();
};

SCORM2004Wrapper.prototype.setSuspend = function() {
  this.setValue('cmi.exit', 'suspend');
};

SCORM2004Wrapper.prototype.setProgressMeasure = function(progress) {
  var value = Math.min(1, Math.max(0, progress));
  this.setValue('cmi.progress_measure', value.toFixed(7));
};

// Utilities
SCORM2004Wrapper.prototype.formatDuration = function(ms) {
  var secs = Math.floor(ms / 1000);
  var h = Math.floor(secs / 3600);
  var m = Math.floor((secs % 3600) / 60);
  var s = secs % 60;
  return 'PT' + h + 'H' + m + 'M' + s + 'S';
};

SCORM2004Wrapper.prototype.setSessionTime = function() {
  if (this.startTime) {
    var duration = new Date() - this.startTime;
    this.setValue('cmi.session_time', this.formatDuration(duration));
  }
};

SCORM2004Wrapper.prototype.isReadOnly = function(element) {
  var readOnlyElements = [
    'cmi.learner_id', 'cmi.learner_name', 'cmi.mode', 'cmi.credit',
    'cmi.entry', 'cmi.total_time', 'cmi.launch_data',
    'cmi.scaled_passing_score', 'cmi.completion_threshold'
  ];
  return readOnlyElements.indexOf(element) !== -1;
};

SCORM2004Wrapper.prototype.startAutocommit = function() {
  var self = this;
  this.commitTimer = setInterval(function() {
    self.commit();
  }, this.autocommitInterval);
};

SCORM2004Wrapper.prototype.stopAutocommit = function() {
  if (this.commitTimer) {
    clearInterval(this.commitTimer);
    this.commitTimer = null;
  }
};

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SCORM2004Wrapper;
}
