// 从仓库根 resource/icon.png 生成桌面应用图标产物：
//   - src/main/assets/icon.png  : 512×512，主进程 BrowserWindow 图标（dev/prod 通用）
//   - build/icon.ico            : 多尺寸 ICO，electron-builder 打包/任务栏用
// 源图标改了之后重跑：pnpm -C apps/desktop gen:icon
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../..') // apps/desktop/scripts → 仓库根
const srcPng = join(root, 'resource/icon.png')
const outPng = join(here, '../src/main/assets/icon.png')
const outIco = join(here, '../build/icon.ico')

// ICO 内嵌的尺寸档：覆盖 Windows 任务栏/标题栏/资源管理器各类显示规格。
const icoSizes = [16, 24, 32, 48, 64, 128, 256]

async function main() {
  const src = await readFile(srcPng)
  await mkdir(dirname(outPng), { recursive: true })
  await mkdir(dirname(outIco), { recursive: true })

  // 窗口图标：512 已足够高清；PNG 无损 + 最高压缩。
  await sharp(src).resize(512, 512, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(outPng)
  console.log(`✓ ${outPng} (512×512)`)

  // 多尺寸 ICO：先逐档生成 PNG buffer，再交给 png-to-ico 拼成单文件。
  const buffers = await Promise.all(
    icoSizes.map((s) => sharp(src).resize(s, s, { fit: 'cover' }).png().toBuffer()),
  )
  const ico = await pngToIco(buffers)
  await writeFile(outIco, ico)
  console.log(`✓ ${outIco} (${icoSizes.join('/')} 多尺寸)`)
}

await main()
