# FEATURE: Native share on mobile

**Status:** proposed for 3.4. Small; no engine, data or calibration change.

## The problem

Every Share button copies a link to the clipboard and shows "Share link copied to clipboard!". On
a phone the player then has to switch apps and paste. Phones have a share sheet (Discord, Messages,
WhatsApp, …) that does this in one tap.

## Where links are shared today

| Button | Code | Link |
|----|----|----|
| Roster **Share** (every roster page) | `handleShareClick` in `lib/common/roster-ui.js` | `?roster=`, plus the page's own parameters through `shareUrlGenerator` (`bosses=`, `plan=`, `agents=`) |
| Favorites **Share** | `lib/pages/favorites.js` | `favorites.html?teams=` |

Both call `copyToClipboard` in `lib/common/roster-share.js`.

## Proposal

One helper beside `copyToClipboard`:

```js
// 'shared' | 'copied' | 'cancelled' | 'failed'
export async function shareLink(url, { title }) { ... }
```

* On a phone, use `navigator.share({ title, url })` when it exists and `navigator.canShare({ url })`
  says yes.
* Otherwise, and on desktop, keep today's clipboard behaviour exactly.
* **Phone test:** use `matchMedia('(pointer: coarse)')`. Desktop Chrome and Edge also support
  `navigator.share`, where it opens the Windows share dialog. That's a worse experience than copying
  the link, so desktop stays on the clipboard.
* **Cancelled** (the player closes the sheet, which raises `AbortError`): do nothing. No toast and
  no clipboard fallback.
* **Any other error:** fall back to the clipboard and show the usual toast.
* `navigator.share` needs a secure context. GitHub Pages (https) and `localhost` both qualify.

The two callers switch to `shareLink` and change their toast only on `'copied'` or `'failed'`. The
button's "Copied!" state shows only when the link was actually copied.

Suggested titles: "My ZZZ roster", "My ZZZ Deadly Assault plan", "My favorite ZZZ teams".
The site is static, so the shared link unfurls with the generic site card whatever the title.

## What it does not do

* It doesn't change any link format. Old links keep working.
* It doesn't add sharing anywhere new.

## Verification

Browser only. Check:
* Android Chrome and iOS Safari: the share sheet opens; cancelling shows nothing; a chosen app
  gets the full link, including `plan=` / `agents=`
* desktop Chrome and Firefox: behaviour is unchanged (copy and toast)

Firefox desktop has no `navigator.share` at all, so it takes the clipboard path naturally.
