import {PDFDocument, rgb, type PDFFont, type PDFPage} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const INK=rgb(.08,.12,.26),MUTED=rgb(.33,.37,.48),LINE=rgb(.84,.86,.91)
const PAGE_LIMIT=200

/** Embedded text, measured wrapping and bounded pagination; no remote assets or active content. */
export class PdfReportWriter {
 private page!:PDFPage
 private font!:PDFFont
 private supported=new Set<number>()
 private y=0
 private section=''
 private document:PDFDocument
 private constructor(document:PDFDocument){this.document=document}
 static async create(assets:Fetcher|undefined){
  if(!assets)throw Error('PDF export requires the installed report font')
  const document=await PDFDocument.create(),writer=new PdfReportWriter(document)
  document.registerFontkit(fontkit)
  const response=await assets.fetch('https://uptime-assets.invalid/design-assets/fonts/noto-sans-regular.ttf')
  if(!response.ok)throw Error('PDF report font unavailable')
  writer.font=await document.embedFont(await response.arrayBuffer(),{subset:true})
  writer.supported=new Set(writer.font.getCharacterSet())
  document.setCreator('Uptime');document.setProducer('Uptime period reports');document.setLanguage('en-US')
  writer.newPage();return writer
 }
 private newPage(continued=false){
  if(this.document.getPageCount()>=PAGE_LIMIT)throw Error(`PDF report exceeds ${PAGE_LIMIT} pages; choose a shorter period or coarser response-time resolution`)
  this.page=this.document.addPage([612,792]);this.y=720
  this.page.drawText('Uptime  /  Period report',{x:48,y:752,size:10,font:this.font,color:MUTED})
  this.page.drawLine({start:{x:48,y:740},end:{x:564,y:740},thickness:.5,color:LINE})
  if(continued&&this.section){this.page.drawText(`${this.section} (continued)`,{x:48,y:this.y,size:12,font:this.font,color:INK});this.y-=30}
 }
 private width(text:string,size:number){
  for(const character of text){const point=character.codePointAt(0)!;if(!this.supported.has(point))throw Error(`PDF font does not support character U+${point.toString(16).toUpperCase()}; JSON and CSV retain the original text`)}
  return this.font.widthOfTextAtSize(text,size)
 }
 text(value:unknown,size=10,spaceAfter=6){
  const text=String(value??'Not reported').replaceAll('\t','    ').replace(/\r\n?/g,'\n'),lines:string[]=[]
  for(const paragraph of text.split('\n')){
   let line=''
   for(const word of paragraph.split(/(?<=\s)/u)){
    if(line&&this.width(line+word,size)>516){lines.push(line.trimEnd());line=''}
    for(const c of word){if(line&&this.width(line+c,size)>516){lines.push(line.trimEnd());line=''}line+=c}
   }
   this.width(line,size);lines.push(line.trimEnd())
  }
  // Keep a record together when it fits on a page; long records still continue without omission.
  const height=lines.length*size*1.5+spaceAfter
  if(height<=620&&this.y-height<48)this.newPage(true)
  for(const line of lines){
   if(this.y<size+48)this.newPage(true)
   this.page.drawText(line,{x:48,y:this.y,size,font:this.font,color:INK});this.y-=size*1.5
  }
  this.y-=spaceAfter
 }
 heading(text:string){
  if(this.y<240)this.newPage();this.section=text;this.y-=10;this.text(text,14,8)
 }
 async finish(title:string){
  this.document.setTitle(title)
  const pages=this.document.getPages()
  pages.forEach((page,index)=>page.drawText(`Page ${index+1} of ${pages.length}`,{x:48,y:28,size:9,font:this.font,color:MUTED}))
  return this.document.save()
 }
}
