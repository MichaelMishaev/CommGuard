const fs = require('fs');
const path = require('path');

const BLACKLIST_FILE = path.join(__dirname, '../url_blacklist.json');
let blockedDomains = new Set();

function normalizeDomain(input) {
  try {
    const url = input.startsWith('http') ? input : 'https://' + input;
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return input.toLowerCase().replace(/^www\./, '').split('/')[0];
  }
}

function loadBlockedDomains() {
  try {
    const data = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
    blockedDomains = new Set(data);
  } catch {
    blockedDomains = new Set();
  }
}

function saveBlockedDomains() {
  fs.writeFileSync(BLACKLIST_FILE, JSON.stringify([...blockedDomains], null, 2));
}

function addBlockedDomain(input) {
  const domain = normalizeDomain(input);
  blockedDomains.add(domain);
  saveBlockedDomains();
  return domain;
}

function removeBlockedDomain(input) {
  const domain = normalizeDomain(input);
  const existed = blockedDomains.delete(domain);
  if (existed) saveBlockedDomains();
  return { existed, domain };
}

function listBlockedDomains() {
  return [...blockedDomains].sort();
}

function isBlockedUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return blockedDomains.has(hostname) || [...blockedDomains].some(d => hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

loadBlockedDomains();

module.exports = { addBlockedDomain, removeBlockedDomain, listBlockedDomains, isBlockedUrl };
