import {customFrameFields,frameDimensions} from './stereotax.ts'
import type {Stereotax,StereotaxArm,Vec3} from './model.ts'
import type {Directions} from './calibration.ts'
import {armKinematics} from './stereotaxSetup.ts'
import {add,localToWorld,scale} from './geometry.ts'
export interface ToolCalibration {
 name:string;tipOffsetMm:Vec3;zeroReadingsMm:Vec3;directions:Directions;zeroStageMm:Vec3;setupSignature:string;calibratedAt:string
}
export const stagePosition=(arm:StereotaxArm):Vec3=>[arm.stageXmm??0,arm.stageYmm??0,arm.stageZmm??0]
/** Slide motion preserves calibration; changing the mount, geometry or axis orientation requires checking it. */
export function armSetupSignature(rig:Stereotax,arm:StereotaxArm):string {
 const {toolCalibration:_,stageXmm:__,stageYmm:___,stageZmm:____,...setup}=arm
 return JSON.stringify({preset:rig.preset,dimensions:customFrameFields.map(([,key])=>frameDimensions(rig)[key]),railLateralMm:rig.railLateralMm??0,railDropMm:rig.railDropMm,setup})
}
export function toolStatus(rig:Stereotax,arm:StereotaxArm):'missing'|'current'|'changed' {
 return !arm.toolCalibration?'missing':arm.toolCalibration.setupSignature===armSetupSignature(rig,arm)?'current':'changed'
}
export function calibrateTool(rig:Stereotax,arm:StereotaxArm,values:Pick<ToolCalibration,'name'|'tipOffsetMm'|'zeroReadingsMm'|'directions'>):void {
 arm.toolCalibration={...structuredClone(values),zeroStageMm:stagePosition(arm),setupSignature:armSetupSignature(rig,arm),calibratedAt:new Date().toISOString()}
}
export function calibratedTool(rig:Stereotax,arm:StereotaxArm):{point:Vec3;readings:Vec3}|null {
 if(toolStatus(rig,arm)!=='current')return null
 const c=arm.toolCalibration!,k=armKinematics(rig,arm)
 const offset=k.stageAxes.reduce((sum,axis,i)=>add(sum,scale(axis,c.tipOffsetMm[i])),[0,0,0] as Vec3)
 return {point:localToWorld(rig.pose,add(k.tip,offset)),readings:stagePosition(arm).map((n,i)=>c.zeroReadingsMm[i]+c.directions[i]*(n-c.zeroStageMm[i])) as Vec3}
}
