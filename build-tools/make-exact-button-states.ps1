param([string]$SourceFolder = 'C:/Users/curti/Desktop/idleWorlds-game-sprites-BC/assets/skills-ui-atlas/families-fixed-v2')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
public static class ExactButtonStates {
  public static Bitmap NormalizeAlpha(Bitmap source) {
    int left=source.Width, top=source.Height, right=-1, bottom=-1;
    for(int y=0;y<source.Height;y++) for(int x=0;x<source.Width;x++) {
      if(source.GetPixel(x,y).A==0) continue;
      left=Math.Min(left,x); top=Math.Min(top,y);
      right=Math.Max(right,x); bottom=Math.Max(bottom,y);
    }
    if(right<left || bottom<top) throw new Exception("Artwork has no visible pixels");
    Bitmap result=new Bitmap(source.Width,source.Height,PixelFormat.Format32bppArgb);
    using(Graphics g=Graphics.FromImage(result)) {
      g.Clear(Color.Transparent);
      g.CompositingMode=CompositingMode.SourceCopy;
      g.CompositingQuality=CompositingQuality.HighQuality;
      g.InterpolationMode=InterpolationMode.HighQualityBicubic;
      g.PixelOffsetMode=PixelOffsetMode.HighQuality;
      g.DrawImage(source,
        new Rectangle(1,1,source.Width-2,source.Height-2),
        new Rectangle(left,top,right-left+1,bottom-top+1),
        GraphicsUnit.Pixel);
    }
    return result;
  }
  public static Bitmap State(Bitmap source, int state) {
    Bitmap result = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
    for(int y=0;y<source.Height;y++) for(int x=0;x<source.Width;x++) {
      Color p=source.GetPixel(x,y);
      double vertical=(double)y/Math.Max(1,source.Height-1);
      // Keep geometry and alpha fixed while making the supplied state artwork
      // do the interaction work. Hover is a deliberate forged-light bloom;
      // clicked darkens from the top down so the face reads as recessed.
      double factor=state==1 ? 1.35 : state==2 ? .42+.26*vertical : 1;
      int lift=state==1 ? 14 : 0;
      result.SetPixel(x,y,Color.FromArgb(p.A,
        Math.Min(255,(int)Math.Round(p.R*factor)+lift),
        Math.Min(255,(int)Math.Round(p.G*factor)+lift),
        Math.Min(255,(int)Math.Round(p.B*factor)+lift)));
    }
    return result;
  }
  public static Bitmap Violet(Bitmap source) {
    Bitmap result=(Bitmap)source.Clone();
    for(int y=0;y<result.Height;y++) for(int x=0;x<result.Width;x++) {
      Color p=source.GetPixel(x,y);
      if(p.B>p.R*1.08 && p.B>p.G*1.08)
        result.SetPixel(x,y,Color.FromArgb(p.A,Math.Min(255,(int)(p.R*.7+p.B*.3)),(int)(p.G*.8),p.B));
    }
    return result;
  }
  public static void Verify(Bitmap idle, Bitmap variant, bool identical) {
    if(idle.Size!=variant.Size) throw new Exception("Canvas mismatch");
    int changes=0;
    for(int y=0;y<idle.Height;y++) for(int x=0;x<idle.Width;x++) {
      Color a=idle.GetPixel(x,y), b=variant.GetPixel(x,y);
      if(a.A!=b.A) throw new Exception("Alpha changed");
      if(a.ToArgb()!=b.ToArgb()) {changes++; if(identical) throw new Exception("Idle differs from original");}
    }
    if(!identical && changes==0) throw new Exception("State has no visual change");
  }
}
'@
$projectRoot = Split-Path $PSScriptRoot -Parent
$outputRoot = Join-Path $projectRoot 'assets/skills-ui/buttons/exact-v3'
New-Item -ItemType Directory -Force $outputRoot | Out-Null
$themes = @('celestial','forged-metal','glacial','infernal','lunar-spectral','runic-arcane','tempest-oceanic','verdant','voidborn')
$audit = @()
function Save-States($base, $folder, $prefix) {
  $names = @('idle','hover','clicked')
  for($state=0;$state -lt 3;$state++) {
    $result=[ExactButtonStates]::State($base,$state)
    $path=Join-Path $folder "$prefix-$($names[$state]).png"
    $result.Save($path,[System.Drawing.Imaging.ImageFormat]::Png)
    $result.Dispose()
    $saved=[System.Drawing.Bitmap]::FromFile($path)
    [ExactButtonStates]::Verify($base,$saved,($state -eq 0))
    $saved.Dispose()
  }
}
foreach($theme in $themes) {
  $folder=Join-Path $outputRoot $theme
  New-Item -ItemType Directory -Force $folder | Out-Null
  $atlas=[System.Drawing.Bitmap]::FromFile((Join-Path $SourceFolder "skills_ui_atlas_theme_$theme.png"))
  foreach($design in @(@('action',72),@('action-secondary',342))) {
    $rect=[System.Drawing.Rectangle]::new([int]$design[1],251,264,75)
    $base=$atlas.Clone($rect,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    # Four source cells overlap the neighboring vertical-rail tip. Its narrow
    # center strip ends at the main button's horizontal top edge.
    if($design[0] -eq 'action') {
      $railEnd = switch($theme) { 'glacial' {19} 'infernal' {34} 'runic-arcane' {36} 'verdant' {28} default {0} }
      for($y=0;$y -lt $railEnd;$y++) { for($x=130;$x -lt 180;$x++) { $base.SetPixel($x,$y,[System.Drawing.Color]::FromArgb(0,0,0,0)) } }
    }
    $normalised=[ExactButtonStates]::NormalizeAlpha($base)
    Save-States $normalised $folder $design[0]
    $normalised.Dispose()
    $base.Dispose()
  }
  $atlas.Dispose()
  $chevronSource= switch($theme) {
    'celestial' { 'celestial/chevron-pressed.png' }
    'tempest-oceanic' { 'tempest-oceanic/chevron-hover.png' }
    'voidborn' { 'lunar-spectral/chevron-idle.png' }
    default { "$theme/chevron-idle.png" }
  }
  $original=[System.Drawing.Bitmap]::FromFile((Join-Path $projectRoot "assets/skills-ui/buttons/themes-v2/$chevronSource"))
  if($original.GetPixel(0,0).A -ne 0) {throw "Chevron source is opaque: $theme"}
  $base=if($theme -eq 'voidborn'){[ExactButtonStates]::Violet($original)}else{$original.Clone()}
  Save-States $base $folder 'chevron-next'
  $base.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX)
  Save-States $base $folder 'chevron-prev'
  $base.Dispose(); $original.Dispose()
  $audit += [PSCustomObject]@{theme=$theme;actionSize='264x75';actionIdle='original atlas pixels, excluding neighboring rail fragments in four primary cells, normalized to fill and center the cell';allStates='identical alpha and dimensions; pronounced RGB state changes verified';chevronSource=$chevronSource;files=12}
  Write-Output "$theme : 12 assets verified"
}
$audit | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $outputRoot 'verification.json')
'All 108 assets saved and verified.'
