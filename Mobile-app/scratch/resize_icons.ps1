$sourcePath = "c:\Users\Admin\Downloads\chotubot-firmware (14)\chotubot\Mobile-app\android\app\src\main\assets\nana-bot.png"
$resDir = "c:\Users\Admin\Downloads\chotubot-firmware (14)\chotubot\Mobile-app\android\app\src\main\res"

Add-Type -AssemblyName System.Drawing

$sizes = @{
    "mipmap-mdpi"    = 48
    "mipmap-hdpi"    = 72
    "mipmap-xhdpi"   = 96
    "mipmap-xxhdpi"  = 144
    "mipmap-xxxhdpi" = 192
}

$srcImage = [System.Drawing.Image]::FromFile($sourcePath)

foreach ($folder in $sizes.Keys) {
    $dim = $sizes[$folder]
    $targetFolder = Join-Path $resDir $folder
    if (!(Test-Path $targetFolder)) {
        New-Item -ItemType Directory -Path $targetFolder -Force
    }

    # Create resized bitmap
    $destBitmap = New-Object System.Drawing.Bitmap($dim, $dim)
    $graphics = [System.Drawing.Graphics]::FromImage($destBitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $graphics.DrawImage($srcImage, 0, 0, $dim, $dim)
    $graphics.Dispose()

    # Save ic_launcher.png
    $iconPath = Join-Path $targetFolder "ic_launcher.png"
    $destBitmap.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)

    # Save ic_launcher_round.png
    $roundPath = Join-Path $targetFolder "ic_launcher_round.png"
    $destBitmap.Save($roundPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $destBitmap.Dispose()
    Write-Host "Created icons in $folder (${dim}x${dim})"
}

$srcImage.Dispose()
Write-Host "All icons generated successfully!"
