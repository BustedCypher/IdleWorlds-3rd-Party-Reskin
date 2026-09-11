param(
  [string]$SourceFolder = 'C:/Users/curti/Desktop/idleWorlds-game-sprites-BC/assets/skills-ui-atlas/source-previews',
  [string]$ChevronSheet = 'assets/skills-ui/buttons/source-v4/_source/infernal-chevron-sheet.png'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public static class SourcePreviewButtons {
  static bool LightNeutral(Color p) {
    int hi=Math.Max(p.R,Math.Max(p.G,p.B));
    int lo=Math.Min(p.R,Math.Min(p.G,p.B));
    return lo>178 && hi-lo<62;
  }

  public static Bitmap Cutout(Bitmap source, Rectangle region, int outWidth, int outHeight) {
    Bitmap crop=source.Clone(region,PixelFormat.Format32bppArgb);
    int w=crop.Width,h=crop.Height;
    bool[] background=new bool[w*h];
    bool[] queued=new bool[w*h];
    Queue<int> queue=new Queue<int>();
    Action<int,int> enqueue=(x,y)=>{int i=y*w+x;if(!queued[i]){queued[i]=true;queue.Enqueue(i);}};
    for(int x=0;x<w;x++){enqueue(x,0);enqueue(x,h-1);}
    for(int y=0;y<h;y++){enqueue(0,y);enqueue(w-1,y);}
    while(queue.Count>0) {
      int i=queue.Dequeue(),x=i%w,y=i/w;
      if(!LightNeutral(crop.GetPixel(x,y))) continue;
      background[i]=true;
      if(x>0)enqueue(x-1,y);if(x+1<w)enqueue(x+1,y);
      if(y>0)enqueue(x,y-1);if(y+1<h)enqueue(x,y+1);
    }
    int left=w,top=h,right=-1,bottom=-1;
    for(int y=0;y<h;y++)for(int x=0;x<w;x++){
      int i=y*w+x;
      if(background[i]){crop.SetPixel(x,y,Color.Transparent);continue;}
      Color p=crop.GetPixel(x,y);
      crop.SetPixel(x,y,Color.FromArgb(255,p.R,p.G,p.B));
      left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x);bottom=Math.Max(bottom,y);
    }
    if(right<left||bottom<top)throw new Exception("No artwork found in source region");
    Bitmap result=new Bitmap(outWidth,outHeight,PixelFormat.Format32bppArgb);
    using(Graphics g=Graphics.FromImage(result)){
      g.Clear(Color.Transparent);g.CompositingMode=CompositingMode.SourceCopy;
      g.CompositingQuality=CompositingQuality.HighQuality;
      g.InterpolationMode=InterpolationMode.HighQualityBicubic;
      g.PixelOffsetMode=PixelOffsetMode.HighQuality;
      g.DrawImage(crop,new Rectangle(2,2,outWidth-4,outHeight-4),
        new Rectangle(left,top,right-left+1,bottom-top+1),GraphicsUnit.Pixel);
    }
    crop.Dispose();return result;
  }

  public static Bitmap State(Bitmap source,int state) {
    Bitmap result=new Bitmap(source.Width,source.Height,PixelFormat.Format32bppArgb);
    for(int y=0;y<source.Height;y++)for(int x=0;x<source.Width;x++){
      Color p=source.GetPixel(x,y);double vertical=(double)y/Math.Max(1,source.Height-1);
      double factor=state==1?1.28:state==2?.55+.15*vertical:1;
      int lift=state==1?10:0;
      result.SetPixel(x,y,Color.FromArgb(p.A,
        Math.Min(255,(int)Math.Round(p.R*factor)+lift),
        Math.Min(255,(int)Math.Round(p.G*factor)+lift),
        Math.Min(255,(int)Math.Round(p.B*factor)+lift)));
    }
    return result;
  }

  public static Bitmap RecolorEmber(Bitmap source,Color accent) {
    Bitmap result=(Bitmap)source.Clone();
    for(int y=0;y<result.Height;y++)for(int x=0;x<result.Width;x++){
      Color p=source.GetPixel(x,y);
      if(p.A==0||p.R<p.G*1.12||p.R<p.B*1.08)continue;
      double energy=Math.Min(1.0,Math.Max(p.R,Math.Max(p.G,p.B))/255.0);
      result.SetPixel(x,y,Color.FromArgb(p.A,
        Math.Min(255,(int)(accent.R*energy)),
        Math.Min(255,(int)(accent.G*energy)),
        Math.Min(255,(int)(accent.B*energy))));
    }
    return result;
  }

  public static void Verify(Bitmap idle,Bitmap variant) {
    if(idle.Size!=variant.Size)throw new Exception("Canvas mismatch");
    int changes=0;
    for(int y=0;y<idle.Height;y++)for(int x=0;x<idle.Width;x++){
      Color a=idle.GetPixel(x,y),b=variant.GetPixel(x,y);
      if(a.A!=b.A)throw new Exception("Alpha changed between states");
      if(a.ToArgb()!=b.ToArgb())changes++;
    }
    if(changes==0)throw new Exception("State has no visual change");
  }
}
'@

$projectRoot=Split-Path $PSScriptRoot -Parent
$outputRoot=Join-Path $projectRoot 'assets/skills-ui/buttons/source-v4'
$sourceArchive=Join-Path $outputRoot '_source'
New-Item -ItemType Directory -Force $sourceArchive | Out-Null
$themes=@('celestial','forged-metal','glacial','infernal','lunar-spectral','runic-arcane','tempest-oceanic','verdant','voidborn')
$accents=@{
  celestial=[Drawing.Color]::FromArgb(44,144,255); 'forged-metal'=[Drawing.Color]::FromArgb(48,142,235)
  glacial=[Drawing.Color]::FromArgb(24,190,255); infernal=[Drawing.Color]::FromArgb(255,72,8)
  'lunar-spectral'=[Drawing.Color]::FromArgb(105,92,255); 'runic-arcane'=[Drawing.Color]::FromArgb(16,210,205)
  'tempest-oceanic'=[Drawing.Color]::FromArgb(10,170,235); verdant=[Drawing.Color]::FromArgb(92,190,45)
  voidborn=[Drawing.Color]::FromArgb(165,62,255)
}

function Save-States([Drawing.Bitmap]$base,[string]$folder,[string]$prefix) {
  $names=@('idle','hover','clicked')
  for($state=0;$state -lt 3;$state++){
    $image=[SourcePreviewButtons]::State($base,$state)
    $path=Join-Path $folder "$prefix-$($names[$state]).png"
    $image.Save($path,[Drawing.Imaging.ImageFormat]::Png);$image.Dispose()
    $saved=[Drawing.Bitmap]::FromFile($path)
    if($state -gt 0){[SourcePreviewButtons]::Verify($base,$saved)}
    $saved.Dispose()
  }
}

$chevronSourcePath=Join-Path $projectRoot $ChevronSheet
if(!(Test-Path -LiteralPath $chevronSourcePath)){throw "Missing chevron source sheet: $chevronSourcePath"}
$chevronSheetBitmap=[Drawing.Bitmap]::FromFile($chevronSourcePath)
$chevronRegion=[Drawing.Rectangle]::new(520,675,500,349)
$chevronEmber=[SourcePreviewButtons]::Cutout($chevronSheetBitmap,$chevronRegion,256,256)
$chevronSheetBitmap.Dispose()

foreach($theme in $themes){
  $folder=Join-Path $outputRoot $theme;New-Item -ItemType Directory -Force $folder | Out-Null
  $preview=[Drawing.Bitmap]::FromFile((Join-Path $SourceFolder "$theme.png"))
  $w=$preview.Width;$h=$preview.Height
  $primaryRegion=[Drawing.Rectangle]::new([int]($w*.07),[int]($h*.50),[int]($w*.41),[int]($h*.30))
  $secondaryRegion=[Drawing.Rectangle]::new([int]($w*.45),[int]($h*.50),[int]($w*.40),[int]($h*.30))
  $primary=[SourcePreviewButtons]::Cutout($preview,$primaryRegion,528,150)
  $secondary=[SourcePreviewButtons]::Cutout($preview,$secondaryRegion,528,150)
  $preview.Dispose()
  Save-States $primary $folder 'action';Save-States $secondary $folder 'action-secondary'
  $primary.Dispose();$secondary.Dispose()

  $next=[SourcePreviewButtons]::RecolorEmber($chevronEmber,$accents[$theme])
  Save-States $next $folder 'chevron-next'
  $next.RotateFlip([Drawing.RotateFlipType]::RotateNoneFlipX)
  Save-States $next $folder 'chevron-prev'
  $next.Dispose()
  Write-Output "$theme : source-preview controls generated"
}
$chevronEmber.Dispose()
Write-Output 'All source-preview button states generated.'
