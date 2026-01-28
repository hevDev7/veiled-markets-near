# Copyable Market ID Feature

## Overview

Market ID di halaman detail sekarang ditampilkan dalam format ringkas (truncated) seperti Creator address, tetapi tetap dapat di-copy dengan mudah menggunakan tombol copy.

## Implementation

### Before
```
Market ID: 2226266059345959235903805886443078929600424190236962232761580543397941034862field
```
- ❌ Terlalu panjang
- ❌ Memakan banyak space
- ❌ Sulit dibaca

### After
```
Market ID: 2226266059...41034862field [📋]
```
- ✅ Ringkas dan clean
- ✅ Tombol copy yang jelas
- ✅ Visual feedback saat copied

## Component: CopyableText

```typescript
function CopyableText({ text, displayText }: { text: string; displayText?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-white font-mono text-sm">
        {displayText || text}
      </span>
      <button onClick={handleCopy}>
        {copied ? <Check /> : <Copy />}
      </button>
    </div>
  )
}
```

## Usage

### Market ID (Truncated)
```tsx
<CopyableText
  text={market.id}
  displayText={`${market.id.slice(0, 10)}...${market.id.slice(-8)}`}
/>
```

Result: `2226266059...41034862field`

### Full Text (No Truncation)
```tsx
<CopyableText text="veiled_markets.aleo" />
```

Result: `veiled_markets.aleo`

## User Experience

### Desktop
1. User melihat Market ID dalam format ringkas
2. Hover pada tombol copy → Tooltip "Copy to clipboard"
3. Click tombol → Icon berubah dari 📋 ke ✓
4. Text di-copy ke clipboard
5. Setelah 2 detik → Icon kembali ke 📋

### Mobile
1. Tap tombol copy
2. Visual feedback (icon berubah)
3. Text copied
4. Toast notification (optional)

## Visual States

### Default State
```
2226266059...41034862field [📋]
                          ↑ Copy icon (gray)
```

### Hover State
```
2226266059...41034862field [📋]
                          ↑ Copy icon (lighter gray)
```

### Copied State
```
2226266059...41034862field [✓]
                          ↑ Check icon (green)
```

## Format Rules

### Market ID
- Show first 10 characters
- Show last 8 characters
- Separator: `...`
- Example: `2226266059...41034862field`

### Creator Address
- Show first 10 characters
- Show last 6 characters
- Separator: `...`
- Example: `aleo10tm5e...nqplv8`

### Transaction ID
- Show first 8 characters
- Show last 8 characters
- Separator: `...`
- Example: `at1eqvc2...d8yyez`

## Benefits

### User Experience
✅ Clean and readable UI
✅ Easy to copy full value
✅ Visual feedback on copy
✅ Consistent with Creator format

### Developer Experience
✅ Reusable component
✅ Simple API
✅ Type-safe
✅ Accessible

### Performance
✅ No external dependencies
✅ Native Clipboard API
✅ Minimal re-renders
✅ Lightweight

## Browser Support

Uses native `navigator.clipboard.writeText()`:
- ✅ Chrome 66+
- ✅ Firefox 63+
- ✅ Safari 13.1+
- ✅ Edge 79+

Fallback for older browsers:
```typescript
const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(text)
  } catch (err) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
  setCopied(true)
}
```

## Accessibility

### Keyboard Navigation
- Tab to focus button
- Enter/Space to copy
- Visual focus indicator

### Screen Readers
```tsx
<button
  onClick={handleCopy}
  aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
  title={copied ? "Copied!" : "Copy to clipboard"}
>
  {copied ? <Check /> : <Copy />}
</button>
```

### Color Contrast
- Copy icon: Gray (#9CA3AF) - WCAG AA compliant
- Check icon: Green (#10B981) - WCAG AA compliant
- Background: Surface-800 (#1E293B)

## Future Enhancements

### 1. Toast Notification
```tsx
import { toast } from 'sonner'

const handleCopy = async () => {
  await navigator.clipboard.writeText(text)
  toast.success('Copied to clipboard!')
}
```

### 2. Copy with Label
```tsx
<CopyableText
  text={market.id}
  displayText="Market ID"
  showFullOnHover
/>
```

### 3. QR Code Generation
```tsx
<CopyableText
  text={market.id}
  showQR
  onQRClick={() => setShowQRModal(true)}
/>
```

### 4. Share Button
```tsx
<CopyableText
  text={market.id}
  showShare
  onShare={() => navigator.share({ text: market.id })}
/>
```

## Testing

### Unit Tests
```typescript
describe('CopyableText', () => {
  it('should display truncated text', () => {
    render(<CopyableText text="long-text" displayText="long..." />)
    expect(screen.getByText('long...')).toBeInTheDocument()
  })

  it('should copy full text on click', async () => {
    const writeText = jest.fn()
    Object.assign(navigator, { clipboard: { writeText } })
    
    render(<CopyableText text="full-text" displayText="full..." />)
    fireEvent.click(screen.getByRole('button'))
    
    expect(writeText).toHaveBeenCalledWith('full-text')
  })

  it('should show check icon after copy', async () => {
    render(<CopyableText text="text" />)
    fireEvent.click(screen.getByRole('button'))
    
    await waitFor(() => {
      expect(screen.getByTestId('check-icon')).toBeInTheDocument()
    })
  })
})
```

### E2E Tests
```typescript
test('copy market ID', async ({ page }) => {
  await page.goto('/market/123')
  
  // Click copy button
  await page.click('[aria-label="Copy to clipboard"]')
  
  // Verify clipboard content
  const clipboardText = await page.evaluate(() => 
    navigator.clipboard.readText()
  )
  expect(clipboardText).toContain('field')
  
  // Verify visual feedback
  await expect(page.locator('[data-testid="check-icon"]')).toBeVisible()
})
```

## Maintenance

### Updating Truncation Rules
Edit format in component usage:

```tsx
// Shorter truncation
displayText={`${text.slice(0, 6)}...${text.slice(-4)}`}

// Longer truncation
displayText={`${text.slice(0, 15)}...${text.slice(-10)}`}

// No truncation
displayText={text}
```

### Styling Updates
Modify button classes:

```tsx
<button
  className="p-1.5 rounded-lg bg-surface-800/50 hover:bg-surface-700/50"
>
```

## Conclusion

CopyableText component memberikan user experience yang lebih baik dengan:
- Clean UI (tidak menampilkan full ID yang panjang)
- Easy copying (satu klik untuk copy)
- Visual feedback (user tahu kapan berhasil copy)
- Consistent design (sama seperti Creator address format)

Fitur ini meningkatkan usability tanpa mengorbankan functionality.
