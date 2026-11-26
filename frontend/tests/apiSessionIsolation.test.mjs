import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import axios from 'axios';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const uri = code => 'data:text/javascript,' + encodeURIComponent(code);
const compile = file => ts.transpileModule(readFileSync(new URL('../src/services/' + file + '.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const source = compile('api').replace('import.meta.env', '({})')
  .replaceAll('"axios"', JSON.stringify(import.meta.resolve('axios')))
  .replace('"./backendAvailability"', JSON.stringify(uri(compile('backendAvailability'))))
  .replace('"./sessionToken"', JSON.stringify(uri(compile('sessionToken'))));
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const token = (user, exp = 100) => `header.${Buffer.from(JSON.stringify({sub: user, sid: 'session-' + user, role: 'ANALISTA', exp})).toString('base64url')}.signature`;

async function client() {
  globalThis.window = new EventTarget();
  globalThis.sessionStorage = storage();
  globalThis.localStorage = storage();
  // Separate module instance for each scenario.
  const moduleUrl = uri(source + '\n// ' + Math.random());
  return {...await import(moduleUrl), moduleUrl};
}
function pendingResponse(api) {
  let resolve, reject, started;
  const ready = new Promise(done => { started = done; });
  api.defaults.adapter = config => new Promise((ok, fail) => {
    resolve = data => ok({ data, status: 200, statusText: 'OK', headers: {}, config });
    reject = status => fail(new axios.AxiosError('Denied', 'ERR_BAD_REQUEST', config, null, {
      data: {code: 'SESSION_EXPIRED'}, status, statusText: 'Denied', headers: {}, config,
    }));
    started();
  });
  return { ready, resolve: data => resolve(data), reject: status => reject(status) };
}

test('successful response from previous login is canceled before reaching the new screen', async () => {
  const c = await client();
  c.setAccessToken(token('A'));
  const pending = pendingResponse(c.api);
  const request = c.api.get('/dashboard/tickets');
  const rejected = assert.rejects(request, error => axios.isCancel(error));
  await pending.ready;
  c.setAccessToken(token('B'));
  pending.resolve([{id: 1, client: 'previous user'}]);
  await rejected;
  assert.equal(c.getAccessToken(), token('B'));
});

test('late 401 and 403 cannot sign out or announce forbidden access for a new login', async () => {
  for (const status of [401, 403]) {
    const c = await client();
    c.setAccessToken(token('A'));
    const events = [];
    window.addEventListener('techlead-hub:unauthorized', () => events.push('unauthorized'));
    window.addEventListener('techlead-hub:forbidden', () => events.push('forbidden'));
    const pending = pendingResponse(c.api);
    const request = c.api.get('/notifications');
    const rejected = assert.rejects(request, error => axios.isCancel(error));
    await pending.ready;
    c.setAccessToken(token('B'));
    pending.reject(status);
    await rejected;
    assert.equal(c.getAccessToken(), token('B'));
    assert.deepEqual(events, []);
  }
});

test('expired old token cannot erase a renewed token from the same session', async () => {
  const c = await client();
  c.setAccessToken(token('A', 100));
  const pending = pendingResponse(c.api);
  const request = c.api.get('/notifications');
  const rejected = assert.rejects(request);
  await pending.ready;
  c.setAccessToken(token('A', 200), {renewal: true});
  pending.reject(401);
  await rejected;
  assert.equal(c.getAccessToken(), token('A', 200));
});

test('current-session expiration still clears the token and requests sign-in', async () => {
  const c = await client();
  c.setAccessToken(token('A'));
  let signIn = 0;
  window.addEventListener('techlead-hub:unauthorized', () => signIn++);
  const pending = pendingResponse(c.api);
  const request = c.api.get('/notifications');
  const rejected = assert.rejects(request);
  await pending.ready;
  pending.reject(401);
  await rejected;
  assert.equal(c.getAccessToken(), null);
  assert.equal(signIn, 1);
});


test('restauração atrasada do AuthProvider não apaga um login realizado enquanto aguardava', async () => {
  const c = await client();
  const providerSource = ts.transpileModule(readFileSync(new URL('../src/context/AuthContext.tsx', import.meta.url), 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX},
  }).outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')))
    .replaceAll('"react"', JSON.stringify(import.meta.resolve('react')))
    .replaceAll('"axios"', JSON.stringify(import.meta.resolve('axios')))
    .replace('"../services/api"', JSON.stringify(c.moduleUrl));
  const {AuthProvider, useAuth} = await import(uri(providerSource));
  let auth;
  function Probe() { auth = useAuth(); return null; }
  renderToStaticMarkup(React.createElement(AuthProvider, null, React.createElement(Probe)));
  c.setAccessToken(token('A'));
  const pending = pendingResponse(c.api);
  const restoring = auth.refreshUser();
  await pending.ready;
  c.setAccessToken(token('B'));
  pending.reject(401);
  assert.equal(await restoring, null);
  assert.equal(c.getAccessToken(), token('B'));
});
