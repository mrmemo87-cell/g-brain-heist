import { build } from 'esbuild';
const user = { id: 'test-learner', email: 'learner@example.com', user_metadata: { full_name: 'Test Learner', access_token: 'must-not-save' } };
const serviceBundle = (await build({ entryPoints: ['services/rememberedAccount.ts'], bundle: true, format: 'iife', globalName: 'accounts', write: false })).outputFiles[0].text + ';window.accounts=accounts;';
const uiBundle = (await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import IELTS from './components/ielts/IELTSLoginView'; import Login from './components/LoginView';
import * as accounts from './services/rememberedAccount';
window.accounts=accounts;
const root=createRoot(document.getElementById('root'));
root.render(window.area==='ielts' ? <IELTS onAuthenticated={()=>window.authenticated=true}/> : <Login onLogin={async(email,password)=>{window.passwordCalls.push([email,password]); accounts.rememberAuthenticatedAccount(window.user);}}/>);
` }, bundle: true, write: false, format: 'iife', loader: { '.css': 'empty' }, plugins: [{ name: 'auth-test-boundaries', setup(b) {
  b.onResolve({ filter: /services\/(ieltsAuthService|authService)$/ }, args => ({ path: args.path, namespace: 'auth-mock' }));
  b.onLoad({ filter: /.*/, namespace: 'auth-mock' }, () => ({ contents: `
export async function loginWithGoogle(hint){ window.googleCalls.push(hint); if(window.googleFailure) throw Error('Provider unavailable'); }
export async function login(email,password){window.passwordCalls.push([email,password]); window.accounts.rememberAuthenticatedAccount(window.user);}
export function isEmailConfirmationRequiredError(){return false;}
export const verifySignupEmailCode=async()=>{}; export const sendPasswordResetEmail=async()=>{};
export const signup=async()=>({confirmationRequired:false}); export const resendSignupConfirmation=async()=>{};
` }));
  b.onResolve({ filter: /services\/(visitorAssistantService|demoRequestService)$/ }, args => ({ path: args.path, namespace: 'unused-mock' }));
  b.onLoad({ filter: /.*/, namespace: 'unused-mock' }, () => ({ contents: 'export const askVisitorAssistant=()=>{}; export const submitDemoRequest=()=>{};' }));
} }] })).outputFiles[0].text;

export { uiBundle, user, serviceBundle };
