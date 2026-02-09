package pdf

// Font family constants.
const (
	fontFamily     = "Helvetica"
	fontFamilyMono = "Courier"
)

// Font size constants (in points).
const (
	fontSizeTitle      = 28
	fontSizeSubtitle   = 14
	fontSizeH1         = 20
	fontSizeH2         = 16
	fontSizeBody       = 11
	fontSizeSmall      = 9
	fontSizeFooter     = 8
	fontSizeCode       = 9
	fontSizeQuizOption = 10
)

// Page layout constants (in mm).
const (
	pageMarginLeft   = 20.0
	pageMarginRight  = 20.0
	pageMarginTop    = 20.0
	pageMarginBottom = 25.0
	lineHeight       = 6.0
	paragraphSpacing = 4.0
	sectionSpacing   = 12.0
	componentSpacing = 8.0
)

// Color represents an RGB color.
type Color struct {
	R, G, B int
}

// Colors used throughout the PDF.
var (
	colorBlack      = Color{0, 0, 0}
	colorDarkGray   = Color{51, 51, 51}
	colorMediumGray = Color{102, 102, 102}
	colorLightGray  = Color{200, 200, 200}
	colorVeryLight  = Color{240, 240, 240}
	colorWhite      = Color{255, 255, 255}
	colorPurple     = Color{124, 58, 237}
	colorBlue       = Color{59, 130, 246}
	colorGreen      = Color{34, 197, 94}
	colorYellow     = Color{234, 179, 8}
	colorRed        = Color{239, 68, 68}
	colorCodeBg     = Color{245, 245, 245}
	colorCalloutBg  = Color{239, 246, 255}
	colorTipBg      = Color{236, 253, 245}
	colorWarningBg  = Color{254, 252, 232}
	colorNoteBg     = Color{245, 243, 255}
)
