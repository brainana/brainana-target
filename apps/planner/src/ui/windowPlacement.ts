export interface WindowRect {left:number;top:number;width:number;height:number}
/** Prefer free space beside the controlled viewer; never assume a particular panel width. */
export function windowPlacement(viewport:{width:number;height:number},size:{width:number;height:number},avoid?:WindowRect):WindowRect {
 const pad=8,w=Math.min(size.width,viewport.width-2*pad),h=Math.min(size.height,viewport.height-2*pad),clamp=(v:number,max:number)=>Math.max(pad,Math.min(v,max-pad))
 const candidates=avoid?[[avoid.left-w-pad,avoid.top],[avoid.left+avoid.width+pad,avoid.top],[avoid.left,avoid.top-h-pad],[avoid.left,avoid.top+avoid.height+pad],[pad,pad]]:[[viewport.width-w-pad,100]]
 return candidates.map(([x,y])=>({left:clamp(x,viewport.width-w),top:clamp(y,viewport.height-h),width:w,height:h})).sort((a,b)=>{
 const overlap=(r:WindowRect)=>avoid?Math.max(0,Math.min(r.left+w,avoid.left+avoid.width)-Math.max(r.left,avoid.left))*Math.max(0,Math.min(r.top+h,avoid.top+avoid.height)-Math.max(r.top,avoid.top)):0
 return overlap(a)-overlap(b)
 })[0]
}
export function placeAwayFromViewer(root:HTMLElement,viewer:Element|null):void {
 const avoid=viewer?.getBoundingClientRect();const b=root.getBoundingClientRect?.()??{width:520,height:400}
 const r=windowPlacement({width:globalThis.innerWidth??1024,height:globalThis.innerHeight??768},{width:b.width||520,height:b.height||400},avoid)
 root.style.left=`${r.left}px`;root.style.top=`${r.top}px`;root.style.right='auto'
}
