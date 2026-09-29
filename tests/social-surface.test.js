import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createSocialSurface, surfaceBounds } from '../desktop/social-surface.js';
import { DEFAULT_ACCOUNTS } from '../server/social.js';

class Contents extends EventEmitter {
  destroyed = false;
  url = 'about:blank';
  async loadURL(url) { this.url=url; this.emit('did-start-loading'); }
  getURL() { return this.url; }
  setZoomFactor(value) { this.zoom=value; }
  isDestroyed() { return this.destroyed; }
  close() { this.destroyed=true; }
}
class View {
  constructor(options) { this.options=options; this.webContents=new Contents(); }
  setBackgroundColor() {}
  setVisible(value) { this.visible=value; }
  setBounds(value) { this.bounds=value; }
}
function fixture() {
  const children = [], events = [], secured = [];
  const window = { isDestroyed:()=>false, getContentSize:()=>[1480,1000], webContents:{getZoomFactor:()=>1,send:(_channel,status)=>events.push(status)}, contentView:{addChildView:view=>children.push(view),removeChildView:view=>children.splice(children.indexOf(view),1)} };
  return { children, events, secured, surface:createSocialSurface({window,View,accounts:()=>DEFAULT_ACCOUNTS,protect:contents=>secured.push(contents)}) };
}
test('social views share only the selected account partition, have no local bridge, and release old pages on switch', () => {
  const {surface,children,secured}=fixture();
  surface.mount(DEFAULT_ACCOUNTS[0].id);
  assert.equal(children.length,2); assert.equal(secured.length,2);
  for(const view of children) {
    assert.equal(view.options.webPreferences.partition,'persist:social-tiktok-lestitcheurfou');
    assert.equal(view.options.webPreferences.sandbox,true);
    assert.equal(view.options.webPreferences.nodeIntegration,false);
    assert.equal(view.options.webPreferences.preload,undefined);
    assert.equal(view.visible,false);
  }
  const old=children.map(view=>view.webContents);
  surface.mount(DEFAULT_ACCOUNTS[2].id);
  assert.ok(old.every(contents=>contents.isDestroyed()));
  assert.equal(children.length,2);
  assert.ok(children.every(view=>view.options.webPreferences.partition==='persist:social-instagram-lestitcheur'));
  assert.throws(()=>surface.mount('unknown'));
  surface.close(); assert.equal(children.length,0);
});
test('native surfaces stay inside content bounds and hide behind local modals or on disabled tabs', () => {
  const {surface,children}=fixture();
  const id=DEFAULT_ACCOUNTS[0].id;
  surface.mount(id);
  const panels={activity:{x:240,y:400,width:600,height:800},analytics:{x:860,y:400,width:600,height:800}};
  surface.layout({accountId:id,visible:true,panels});
  assert.deepEqual(children[0].bounds,{x:240,y:400,width:600,height:600});
  assert.equal(children[0].visible,true);
  assert.equal(children[0].webContents.zoom,0.5);
  surface.layout({accountId:id,visible:false,panels});
  assert.ok(children.every(view=>!view.visible));
  surface.layout({accountId:id,visible:true,panels:{activity:panels.activity}});
  assert.equal(children[0].visible,true); assert.equal(children[1].visible,false);
  surface.layout({accountId:'old-account',visible:false,panels:{}});
  assert.equal(children[0].visible,true);
  assert.equal(surfaceBounds({x:0,y:0,width:500,height:300},[1480,1000]),null);
  assert.equal(surfaceBounds({x:10,y:40,width:Infinity,height:300},[1480,1000]),null);
  assert.deepEqual(surfaceBounds({x:200,y:100,width:400,height:200},[1480,1000],1.5),{x:300,y:150,width:600,height:300});
});
test('failed social pages show a recoverable error and stale loading events cannot revive a closed account', () => {
  const {surface,children,events}=fixture();
  surface.mount(DEFAULT_ACCOUNTS[0].id);
  const contents=children[0].webContents;
  contents.emit('did-fail-load',{},-105,'network error','https://www.tiktok.com/',true);
  contents.emit('did-stop-loading');
  assert.equal(surface.snapshot().panels[0].phase,'error');
  assert.equal(children[0].visible,false);
  surface.refresh('activity');
  assert.equal(surface.snapshot().panels[0].phase,'loading');
  contents.url='https://www.tiktok.com/login'; contents.emit('did-stop-loading');
  assert.equal(surface.snapshot().panels[0].phase,'login');
  surface.close(); const count=events.length;
  contents.emit('did-stop-loading'); assert.equal(events.length,count);
  assert.throws(()=>surface.refresh('arbitrary-url'));
});

test('personal Discord uses one isolated client panel and cannot inherit social sessions',()=>{
  const children=[];
  const window={isDestroyed:()=>false,getContentSize:()=>[1480,1000],webContents:{send:()=>{},getZoomFactor:()=>1},contentView:{addChildView:v=>children.push(v),removeChildView:v=>children.splice(children.indexOf(v),1)}};
  const surface=createSocialSurface({window,View,accounts:()=>[{id:'discord-personal',platform:'discord'}],protect:()=>{}});
  surface.mount('discord-personal');
  assert.equal(children.length,1);
  assert.equal(children[0].options.webPreferences.partition,'persist:social-discord-personal');
  assert.equal(children[0].webContents.getURL(),'https://discord.com/channels/@me');
  assert.equal(surface.snapshot().panels[0].target,'client');
  assert.throws(()=>surface.refresh('activity'));
  surface.close();assert.equal(children.length,0);
});

test('publishing switches to one isolated panel and restores monitoring on return',()=>{
 const {surface,children}=fixture();const id=DEFAULT_ACCOUNTS[0].id;
 surface.mount(id);const old=children.map(v=>v.webContents);
 surface.mount(id,'publish');assert.equal(children.length,1);assert.ok(old.every(v=>v.destroyed));
 assert.equal(surface.snapshot().panels[0].target,'publish');assert.match(children[0].webContents.url,/tiktokstudio\/upload$/);
 assert.equal(children[0].options.webPreferences.partition,'persist:social-'+id);
 surface.mount(id);assert.equal(children.length,2);surface.close();
});

test('creative services have isolated persistent partitions and close all native content',async()=>{
 const {CREATOR_ACCOUNTS}=await import('../server/social.js');const children=[];
 const window={isDestroyed:()=>false,getContentSize:()=>[1480,1000],webContents:{send:()=>{},getZoomFactor:()=>1},contentView:{addChildView:v=>children.push(v),removeChildView:v=>children.splice(children.indexOf(v),1)}};
 const surface=createSocialSurface({window,View,accounts:()=>CREATOR_ACCOUNTS,protect:()=>{}});
 for(const account of CREATOR_ACCOUNTS){surface.mount(account.id);assert.equal(children.length,1);assert.equal(surface.snapshot().panels[0].target,'create');assert.equal(children[0].options.webPreferences.partition,'persist:social-'+account.id);assert.equal(children[0].options.webPreferences.preload,undefined);}
 const content=children[0].webContents;surface.close();assert.equal(children.length,0);assert.equal(content.destroyed,true);
});
