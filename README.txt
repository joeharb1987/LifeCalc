LifeCalc V4 — full calculator behaviour pass

Main fixes:
- No live answer preview while entering a calculation.
- The large display now shows the calculation itself until '=' is pressed.
- The answer is only revealed after '='.
- Repeated '=' repeats the last operation.
- AC changes to C while a calculation is active.
- Operators replace each other cleanly instead of creating broken expressions.
- Percentage behaviour is contextual:
  * 100 + 10% = 110
  * 100 - 10% = 90
  * 100 × 10% = 10
  * 100 ÷ 10% = 1000
- +/- works on results and trailing numeric entries.
- Better handling of decimals and leading zeroes.
- History remains available and now stores V4 calculations.
- Light/dark theme remains.
- iPhone zoom lock remains.
- Converter values corrected to Australian metric conventions for cups/tablespoons.
- Service-worker cache bumped to V4 so the new app is fetched.

Update existing GitHub Pages app:
1. Replace the existing LifeCalc files with the files in this folder.
2. Commit to main in GitHub Desktop.
3. Push origin.
4. Wait around 1 minute.
5. Fully close LifeCalc on iPhone and reopen.
6. If iPhone still shows the old cached version, open the GitHub Pages URL in Safari and refresh once.
