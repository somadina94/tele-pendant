# Two screens, one picture each

Each Operator screen has its own picture, its own labels, and its own buttons. A new screen starts with no buttons. Add the buttons on that screen in Config. The picture name does not have to contain `p03a21`.

This guide does not include a sample machine drawing. Upload the drawing you already have.

## Add a second screen

1. Open Config, then Background.
2. Type a name that is not the first screen and choose Add.
3. Activate the new screen.
4. Open Operator. The button grid for the new screen is empty until you add cells on that screen.

## Upload a PDF

1. Stay on the screen you want the drawing on.
2. In Config, Background, choose Upload SVG, image, or PDF.
3. Pick the drawing PDF. The app keeps the PDF and shows page 1 as the picture.
4. Open Operator. The picture is that page. Labels use percentages of the drawn page, so they stay on the same spot when the window changes size.

SVG, PNG, JPEG, WebP, and GIF still upload. Images stay at 2 MB. A PDF can be up to 8 MB.

The phone Config screen accepts the same file types.

## Place a label by clicking

1. Config, Live labels, Add a label.
2. Click the picture. A small label chip sits where you clicked, and X and Y fill in.
3. You can still type X and Y. Save stores those percentages on this screen only.

The phone does the same with a tap.

## Buttons stay reachable

The picture keeps the leftover height. The button grid stays on the screen with the picture and STOP. It does not scroll.

## Phone

The Expo app reads the same screens. Point it at the API on this computer, for example `http://192.168.0.192:4050/api/v1`, and restart Expo after changing that address. The public IP is not the address the phone uses on the factory Wi-Fi.

The phone draws an SVG itself. A PDF is the PNG of page 1 that the API stored, so that page shows on the phone too. The buttons use the same compact grid as the web Operator screen and stay on the page with STOP at the bottom. Nothing in that panel scrolls. Face login stays off unless `EXPO_PUBLIC_FACE_LOGIN=true`.

A factory API on plain HTTP needs `EXPO_PUBLIC_ALLOW_HTTP` left unset (the address starts with `http://`) or set to `true`, then a new install. See From zero.
