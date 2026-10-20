export const defaults=()=>({speed:1,transparency:50,mute:false,levels:{bgm:50,se:50,voice:50,bgv:50},muted:{}});
export function readStoryOptions(key,initial=defaults()){
  try{const saved=JSON.parse(localStorage.getItem(key));if(saved)return {...initial,...saved,transparency:saved.opacity!=null?100-saved.opacity:saved.transparency??initial.transparency,levels:{...initial.levels,...saved.levels},muted:{...saved.muted}};}catch{}
  return initial;
}
export function applyStoryOptions(player,config){
  for(const kind of ['voice','bgv','bgm','se'])player.audio.level(kind,config.mute||config.muted[kind]?0:Math.max(0,Math.min(100,config.levels[kind]))/100);
  player.textInterval=[75,40,20,0][config.speed]??40;
}

const element=(tag,cls,text='')=>{const node=document.createElement(tag);node.className=cls;node.textContent=text;return node;};

// Only the presentation changes. Script timing, media, history and bookmarks
// continue to use the same player as the downloaded original interface.
export class BuiltinStoryUi {
  player: any;
  config: any;
  modal: any = null;
  savedOptions: any = null;
  messageHost: any;
  menuHost: any;
  autoButton: any;
  onKey: any;
  initial: any;

  constructor(player,public optionsKey:string,initial=defaults()){
    this.player=player;this.initial=structuredClone(initial);this.config=readStoryOptions(optionsKey,initial);
    player.stage.classList.add('builtin-story');
    this.messageHost=element('div','builtin-story-message');
    player.speaker=element('div','builtin-story-speaker');
    player.text=element('div','builtin-story-text');
    player.marker=element('span','builtin-story-marker','▾');player.marker.setAttribute('aria-hidden','true');
    this.messageHost.append(player.speaker,player.text,player.marker);player.window=this.messageHost;
    this.menuHost=element('div','builtin-story-menu');player.controls=this.menuHost;
    const badge=element('span','builtin-story-badge','内置界面');
    this.autoButton=this.button('自动',()=>this.setAuto(!player.auto),'自动播放');
    this.menuHost.append(badge,this.autoButton,this.button('记录',()=>this.openLog(),'对白记录'),
      this.button('设置',()=>this.openOptions(),'播放设置'),this.button('隐藏',()=>player.toggleUi(),'隐藏界面'),
      this.button('跳过',()=>this.openSkip(),'跳过剧情'));
    player.stage.append(this.messageHost,this.menuHost);this.setAuto(false);this.applyConfig();
    this.onKey=event=>{
      if(!this.modal)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.closeModal(false);}
      else if(event.key==='Tab'){
        const controls=[...this.modal.host.querySelectorAll('button:not(:disabled),input,select')];
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first||!event.shiftKey&&document.activeElement===last||!this.modal.host.contains(document.activeElement)){
          event.preventDefault();(event.shiftKey?last:first)?.focus();
        }
      }
    };
    player.stage.addEventListener('keydown',this.onKey);
  }
  button(text,action,label=text){
    const button=element('button','builtin-story-button',text);button.type='button';button.setAttribute('aria-label',label);
    button.addEventListener('click',event=>{event.stopPropagation();Promise.resolve().then(action).catch(error=>this.player.fail(error));});
    return button;
  }
  setAuto(value){this.player.auto=value;this.autoButton.textContent=value?'停止':'自动';this.autoButton.setAttribute('aria-pressed',String(value));this.autoButton.setAttribute('aria-label',value?'停止自动播放':'自动播放');}
  setWindow(adult){this.messageHost.dataset.window=adult?'adult':'normal';}
  writeText(speaker,text){this.player.speaker.textContent=speaker;this.player.speaker.hidden=!speaker;this.player.text.textContent=text;}
  applyConfig(){if(this.config.opacity!=null)this.config.opacity=100-this.config.transparency;applyStoryOptions(this.player,this.config);this.messageHost.style.setProperty('--dialogue-alpha',String(1-this.config.transparency/100));}
  popup(name,title){
    const player=this.player;player.hold.stop();this.closeModal(false);
    const focus=document.activeElement,host=element('div','builtin-story-popup');
    host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');host.setAttribute('aria-label',title);
    const panel=element('section','builtin-story-dialog'),header=element('header','builtin-story-dialog-header');
    const close=this.button('关闭',()=>this.closeModal(false),'关闭'+title);header.append(element('h2','',title),close);
    const body=element('div','builtin-story-dialog-body'),footer=element('div','builtin-story-dialog-footer');
    panel.append(header,body,footer);host.append(panel);player.stage.append(host);
    this.modal={name,host,body,footer,focus};this.menuHost.inert=true;this.messageHost.inert=true;player.footer.inert=true;
    close.focus({preventScroll:true});return this.modal;
  }
  closeModal(commit=false){
    if(!this.modal)return;
    const {name,host,focus}=this.modal;this.player.audio.stop('log-voice');
    if(name==='options'&&!commit&&this.savedOptions){this.config=this.savedOptions;this.applyConfig();}
    host.remove();this.modal=null;this.savedOptions=null;
    this.menuHost.inert=false;this.messageHost.inert=false;this.player.footer.inert=false;
    (focus?.isConnected&&!focus.closest('[hidden]')?focus:this.player.stage).focus({preventScroll:true});
  }
  openOptions(){
    const modal=this.popup('options','播放设置');this.savedOptions=structuredClone(this.config);
    const refresh=()=>{
      modal.body.replaceChildren();
      const mute=element('input','');mute.type='checkbox';mute.checked=this.config.mute;
      const muteLabel=element('label','builtin-story-option','全部静音');muteLabel.append(mute);modal.body.append(muteLabel);
      mute.addEventListener('change',()=>{this.config.mute=mute.checked;this.applyConfig();});
      for(const [kind,name]of [['voice','角色配音'],['bgv','背景语音'],['bgm','背景音乐'],['se','音效']]){
        const label=element('label','builtin-story-option',name),input=element('input',''),value=element('output','','');
        input.type='range';input.min='0';input.max='100';input.value=String(this.config.muted[kind]?0:this.config.levels[kind]);value.textContent=input.value+'%';
        input.setAttribute('aria-label',name+'音量');input.addEventListener('input',()=>{this.config.levels[kind]=Number(input.value);this.config.muted[kind]=false;value.textContent=input.value+'%';this.applyConfig();});
        label.append(input,value);modal.body.append(label);
      }
      const select=(title,options,current,change)=>{
        const label=element('label','builtin-story-option',title),input=element('select','');
        for(const [value,text]of options){const option=element('option','',text);option.value=String(value);input.append(option);}
        input.value=String(current);input.addEventListener('change',()=>{change(Number(input.value));this.applyConfig();});label.append(input);modal.body.append(label);
      };
      select('文字速度',[[0,'慢速'],[1,'普通'],[2,'快速'],[3,'立即显示']],this.config.speed,value=>this.config.speed=value);
      select('窗口透明度',[[0,'不透明'],[50,'半透明'],[100,'全透明']],this.config.transparency,value=>this.config.transparency=value);
    };
    refresh();modal.footer.append(this.button('恢复默认',()=>{this.config=structuredClone(this.initial);this.applyConfig();refresh();}),
      this.button('取消',()=>this.closeModal(false)),this.button('保存',()=>{localStorage.setItem(this.optionsKey,JSON.stringify(this.config));this.closeModal(true);}));
  }
  openLog(){
    const player=this.player;if(!player.engine)return;const modal=this.popup('log','对白记录');
    for(const action of player.story.program.commands.filter(action=>action.dialogue!==undefined&&action.dialogue<=player.engine.line)){
      const row=element('article','builtin-story-log-line'),speaker=/<user>|<player>/.test(action.speaker||'')?'プレイヤー':action.speaker||'旁白';
      const text=String(action.text).replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,'').replace(/\\n/g,'\n');
      const replay=this.button(text,()=>{this.closeModal(true);return player.engine.seek(action.dialogue);},'回到第 '+(action.dialogue+1)+' 句对白');
      replay.classList.add('builtin-story-replay');row.append(element('div','builtin-story-speaker',speaker),replay);
      const voice=action.cue&&player.story.audio[action.cue]?.file;
      if(voice)row.append(this.button('重听',()=>player.audio.play('log-voice',voice,{kind:'voice'}),'重听配音'));
      modal.body.append(row);
    }
    modal.body.scrollTop=modal.body.scrollHeight;
  }
  openSkip(){
    const modal=this.popup('skip','跳过剧情');modal.body.append(element('p','',this.player.story.title||'当前章节'),element('p','','跳到本章结尾？'));
    modal.footer.append(this.button('继续播放',()=>this.closeModal(true)),this.button('跳过本章',async()=>{
      this.closeModal(true);this.setAuto(false);await this.player.engine.seek(Math.max(0,this.player.story.program.dialogue-1));this.player.reveal();await this.player.engine.next();
    }));
  }
  destroy(){this.closeModal(true);this.player.stage.removeEventListener('keydown',this.onKey);this.messageHost.remove();this.menuHost.remove();this.player.stage.classList.remove('builtin-story');}
}
