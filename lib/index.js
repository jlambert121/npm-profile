'use strict'
const mfh = require('make-fetch-happen')
const validate = require('aproba')
const url = require('url')

exports.create = create
exports.login = login
exports.get = get
exports.set = set

function fetch (uri, opts) {
  if (!opts) opts = {}
//  console.log(uri)
//  console.log(opts)
  return mfh(uri, opts)
}

function create (username, email, password, registry) {
  validate('SSSS', arguments)
  const userobj = {
    _id: 'org.couchdb.user:' + username,
    name: username,
    password: password,
    email: email,
    type: 'user',
    roles: [],
    date: new Date().toISOString()
  }
  const logObj = {}
  Object.keys(userobj).forEach(k => {
    logObj[k] = k === 'password' ? 'XXXXX' : userobj[k]
  })
  process.emit('log', 'verbose', 'create', 'before first PUT', logObj)

  const target = url.resolve(registry, '-/user/org.couchdb.user:' + encodeURIComponent(username))
  
  return fetch(target, {
    method: 'PUT',
    body: JSON.stringify(userobj),
    headers: { 'Content-Type': 'application/json' }
  }).then(res => {
    if (res.status < 200 || res.status >= 300) {
      const err = new Error(res.statusText)
      err.code = res.status
      err.headers = res.headers.raw()
      if (res.status === 409) err.message = `A user with the username "${username}" already exists.`
      return res.json().then(body => {
        if (body.error) err.message = body.error
        throw err
      })
    }
    return res.json()
  })
}

login.AuthOTP = function (auth) {
  Error.call(this)
  this.message = 'OTP required for authentication'
  Error.captureStackTrace(this, login.AuthOTP)
  this.auth = auth
  this.code = 'otp'
}
login.AuthOTP.prototype = Error.prototype

login.AuthIPAddress = function (auth) {
  Error.call(this)
  this.message = 'Login is not allowed from your IP address'
  Error.captureStackTrace(this, login.AuthOTP)
  this.auth = auth
  this.code = 'ip'
}
login.AuthIPAddress.prototype = Error.prototype

function login (username, password, registry, auth) {
  validate('SSSO', arguments)
  const userobj = {
    _id: 'org.couchdb.user:' + username,
    name: username,
    password: password,
    type: 'user',
    roles: [],
    date: new Date().toISOString()
  }
  const headers = authHeaders(auth)
  headers['Content-Type'] = 'application/json'
  const logObj = {}
  Object.keys(userobj).forEach(k => {
    logObj[k] = k === 'password' ? 'XXXXX' : userobj[k]
  })
  process.emit('log', 'verbose', 'login', 'before first PUT', logObj)

  const target = url.resolve(registry, '-/user/org.couchdb.user:' + encodeURIComponent(username))
  
  return fetch(target, {
    method: 'PUT',
    headers: headers,
    body: JSON.stringify(userobj)
  }).then(res => {
    if (res.status === 401 && res.headers.get('www-authenticate')) {
      const auth = res.headers.get('www-authenticate').split(/,\s*/).map(s => s.toLowerCase())
      if (auth.indexOf('ipaddress') !== -1) {
        throw new login.AuthIPAddress(res.headers.raw())
      } else if (auth.indexOf('otp') !== -1) {
        throw new login.AuthOTP(res.headers.raw())
      } else {
        throw new Error('Unable to authenticate')
      }
    } else if (res.status < 200 || res.status >= 300) {
      const err = new Error(res.statusText)
      err.code = res.status
      err.headers = res.headers.raw()
      if (res.status === 400) err.message = `There is no user with the username "${username}".`
      throw err
    }
    return res.json()
  })
}

function get (registry, auth) {
  const target = url.resolve(registry, '-/npm/v1/user')
  const headers = authHeaders(auth)
  return fetch(target, {headers: headers}).then(res => {
    if (res.status < 200 || res.status >= 300) {
      const err = new Error(res.statusText)
      err.code = res.status
      err.headers = res.headers.raw()
      throw err
    }
    return res.json()
  })
}

function set (profile, registry, auth) {
  const target = url.resolve(registry, '-/npm/v1/user')
  const headers = authHeaders(auth)
  headers['Content-Type'] = 'application/json'
  return fetch(target, {
    method: 'POST',
    body: JSON.stringify(profile),
    headers: headers
  }).then(res => {
    if (res.status < 200 || res.status >= 300) {
      const err = new Error(res.statusText)
      err.code = res.status
      err.headers = res.headers.raw()
      throw err
    }
    return res.json()
  })
}

function authHeaders (auth) {
  const headers = {}
  if (!auth) return headers
  if (auth.otp) headers['npm-otp'] = auth.otp
  if (auth.token) {
    headers['Authorization'] = 'Bearer ' + auth.token
  } else if (auth.basic) {
    const basic = auth.basic.username + ':' + auth.basic.password
    headers['Authorization'] = 'Basic ' + Buffer.from(basic).toString('base64')
  }
  return headers
}