'use strict';

var urlModule = require('url');

var domain = {};
domain.primaryDomains = {};

domain.addPrimary = function(url) {
	url = urlModule.parse(url.url);
	domain.primaryDomains[url.hostname] = true;
};

domain.filter = function(url) {
  var subDomains =  url.subDomains;

  if (url.primary) {
    domain.addPrimary(url);
    delete url.primary;
  }

  url = urlModule.parse(url.url);

  if (subDomains) {
    if (url.protocol === 'data:') {
      return false;
    }
    return true;
  }
  return url.hostname in domain.primaryDomains;
};

module.exports = domain;
