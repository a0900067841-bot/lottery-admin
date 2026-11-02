"use strict";
// QR camera reading for iPhone Safari and modern browsers. Never redeems automatically.
// jsQR 1.4.0 (Apache-2.0): loaded on demand from jsDelivr when needed; no upload and
// no backend request is made with camera frames or QR values by the scanner itself.
(()=>{
  const FIELDS=[
    {id:'redeemCode',label:'使用相機掃描紙本 QR',permission:'redeem'},
    {id:'handoffQrValue',label:'使用相機掃描交付紙券 QR',permission:'accounts_manage'}
  ];
  const validQr=s=>/^YIQI1\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/.test(s);
  let stopActive=null, loadPromise=null;
  function loadDecoder(){
    if(typeof window.jsQR==='function')return Promise.resolve(window.jsQR);
    if(loadPromise)return loadPromise;
    loadPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
      s.async=true;s.crossOrigin='anonymous';
      s.onload=()=>typeof window.jsQR==='function'?resolve(window.jsQR):reject(Error('QR 解碼器未載入'));
      s.onerror=()=>reject(Error('無法載入 QR 解碼器，請確認網路'));
      document.head.append(s);
    }).catch(e=>{loadPromise=null;throw e;});
    return loadPromise;
  }
  for(const item of FIELDS){
    const input=document.getElementById(item.id);
    if(!input)continue;
    const btn=document.createElement('button');btn.type='button';btn.textContent=item.label;
    btn.className='lottery-camera-button';btn.style.cssText='display:block;margin:8px 0 12px;max-width:100%';
    input.insertAdjacentElement('afterend',btn);
    const holder=document.createElement('div');holder.hidden=true;holder.style.cssText='max-width:430px;margin:8px 0 15px';
    const video=document.createElement('video');video.setAttribute('playsinline','');video.playsInline=true;video.muted=true;video.autoplay=true;
    video.style.cssText='width:100%;background:#111;border-radius:12px;max-height:340px';
    const msg=document.createElement('p');msg.setAttribute('role','status');
    const close=document.createElement('button');close.type='button';close.textContent='停止相機';
    holder.append(video,msg,close);btn.insertAdjacentElement('afterend',holder);
    function closeCamera(){ if(stopActive)stopActive(); }
    close.addEventListener('click',closeCamera);
    btn.addEventListener('click',async()=>{
      if(typeof window.lotteryCan!=='function'||!window.lotteryCan(item.permission)){
        holder.hidden=false;msg.textContent='請先登入具有權限的帳號。';return;
      }
      closeCamera();holder.hidden=false;btn.disabled=true;msg.textContent='正在開啟後置相機…';
      let stream=null,frame=0,ended=false;
      const stop=()=>{ended=true;cancelAnimationFrame(frame);if(stream)for(const track of stream.getTracks())track.stop();video.srcObject=null;holder.hidden=true;btn.disabled=false;if(stopActive===stop)stopActive=null;};
      stopActive=stop;
      try{
        if(!navigator.mediaDevices?.getUserMedia)throw Error('此瀏覽器不支援網站相機，請使用 Safari 開啟 HTTPS 網址');
        stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});
        if(ended){for(const t of stream.getTracks())t.stop();return;}
        video.srcObject=stream;await video.play();
        let fallback=null;try{if(window.BarcodeDetector)fallback=new BarcodeDetector({formats:['qr_code']});}catch(_){fallback=null;}
        const decoderPromise=loadDecoder().catch(()=>null);
        const decoder=await decoderPromise;
        if(ended)return;
        if(!decoder&&!fallback)throw Error('QR 解碼器無法載入，請確認手機網路');
        msg.textContent='請將實體紙本 QR Code 對準鏡頭。掃描只會填入文字，不會自動核銷。';
        const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
        if(!ctx)throw Error('瀏覽器不支援影像解析');
        let last=0,busy=false;
        const scan=async(time)=>{
          if(ended)return;
          frame=requestAnimationFrame(scan);
          if(busy||time-last<180||!video.videoWidth||!video.videoHeight)return;
          last=time;busy=true;
          try{
            let qr=null;
            const width=Math.min(640,video.videoWidth),height=Math.round(video.videoHeight*width/video.videoWidth);
            canvas.width=width;canvas.height=height;ctx.drawImage(video,0,0,width,height);
            if(decoder){const data=ctx.getImageData(0,0,width,height);qr=decoder(data.data,width,height)?.data||null;}
            else if(fallback){const result=await fallback.detect(canvas);qr=result?.[0]?.rawValue||null;}
            if(qr){
              qr=String(qr).trim();
              if(validQr(qr)){input.value=qr;input.dispatchEvent(new Event('input',{bubbles:true}));stop();input.focus();}
              else msg.textContent='已讀到 QR，但不是億柒有效獎券格式；請掃描紙本獎券。';
            }
          }catch(e){msg.textContent='相機掃描暫時失敗，可改貼入完整 QR。';}
          finally{busy=false;}
        };
        frame=requestAnimationFrame(scan);
      }catch(e){if(stream)for(const t of stream.getTracks())t.stop();video.srcObject=null;btn.disabled=false;msg.textContent='無法開始掃描：'+e.message+'。仍可使用掃描器貼入完整 QR。';stopActive=null;}
    });
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&stopActive)stopActive();});
  document.querySelector('nav')?.addEventListener('click',()=>{if(stopActive)stopActive();});
})();
