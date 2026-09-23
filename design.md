# StockIQ — UI/UX Design System & Specification

## 1. Visual Identity & Brand Philosophy

StockIQ is an institutional financial technology and compliance verification platform. Its visual identity conveys **trust, precision, regulatory seriousness, and effortless clarity**. 

The design system is grounded in **Material Design 3 (M3)** with custom financial styling:
* **Deep Navy & Slate foundation** represents security, permanence, and institutional authority.
* **Teal & Amber accents** provide sharp visual focus for verified credentials, actions, and audit milestones.
* **High-contrast typography and spacious 8dp grid spacing** maximize readability of dense financial disclosures and recommendations.

---

## 2. Color Palette & Theming

The color architecture is defined in `/app/src/main/java/com/example/ui/theme/Color.kt` and `/app/src/main/java/com/example/ui/theme/Theme.kt`.

### 2.1 Core Palette Tokens (Implemented)
| Token Name | Hex Value | Semantic Purpose |
|---|---|---|
| `NavyPrimary` | `#0F172A` | Deep slate-navy. Used for top bars, primary buttons, major headings, and dark backgrounds. |
| `SlateSecondary` | `#334155` | Neutral slate. Used for secondary text, metadata labels, icon tints, and supporting cards. |
| `TealAccent` | `#0D9488` | Deep teal. Primary brand accent used for verified badges, successful state indicators, and active highlights. |
| `AmberAccent` | `#D97706` | Warm amber. Used for warning alerts, pending verification states, and risk indicators. |
| `ErrorColor` | `#EF4444` | High-visibility red. Used for error messages, stop-loss markers, and destructive actions. |

### 2.2 Surface & Background System (Implemented)
* **Light Theme**:
  * `SlateLightBg` (`#F8FAFC`): Clean, off-white slate background providing soft contrast against pure white cards.
  * `SlateLightSurface` (`#FFFFFF`): Pristine white container for elevated cards, dialogs, and text fields.
  * `SlateLightBorder` (`#E2E8F0`): Subtle 1dp neutral border separating cards, dividers, and input borders.
* **Dark Theme**:
  * `SlateDarkBg` (`#0F172A`): Deep navy canvas for eye-safe night-time usage.
  * `SlateDarkSurface` (`#1E293B`): Elevated slate container for cards and interactive components.
  * `SlateDarkBorder` (`#334155`): Subtle border defining card boundaries in dark mode.

---

## 3. Typography & Hierarchy

StockIQ utilizes a modern sans-serif typeface (Inter / Roboto system font) adhering strictly to standard scale tokens in `/app/src/main/java/com/example/ui/theme/Type.kt`.

### 3.1 Type Hierarchy (Implemented)
* **Display & Brand**: `Stock` in `titleLarge` (NavyPrimary, Bold) paired with `IQ` (TealAccent, Bold).
* **Headlines (`headlineMedium`, 24–28sp)**: Used for screen titles, auth welcome greetings, and modal headings (Bold / Semi-Bold).
* **Titles (`titleLarge`, 20–22sp)**: Section headings, card titles, and provider profile names (Semi-Bold).
* **Subtitles (`titleMedium`, 16–18sp)**: Metric values, recommendation ticker symbols, and form section headers.
* **Body (`bodyMedium`, 14sp)**: Explanatory text, risk disclosures, recommendation rationales, and input labels.
* **Captions & Tags (`labelSmall`, 10–12sp)**: Status badges (e.g., "BETA", "SEBI VERIFIED"), timestamps, and helper text.

---

## 4. Component Standards

### 4.1 Buttons (Implemented)
* **Primary Filled Button**:
  * Container: `NavyPrimary` (Light Theme) or `TealAccent` (Dark Theme).
  * Content: `#FFFFFF` or high-contrast navy.
  * Corner Radius: `12.dp` (Medium rounded).
  * Min Touch Target: `48.dp` height.
  * Usage: Primary actions ("Request OTP", "Verify Code", "Sign Agreement").
* **Secondary / Outlined Button**:
  * Border: `1.dp` solid in `SlateLightBorder` or `SlateSecondary`.
  * Background: Transparent.
  * Content: `NavyPrimary` / `SlateSecondary`.
  * Usage: Secondary actions ("Switch Role", "Cancel", "View Documentation").
* **Destructive Button**:
  * Container: `ErrorColor` (`#EF4444`).
  * Usage: Revoking access, rejecting provider dossier, emergency stop.

### 4.2 Cards & Containers (Implemented)
* **Standard Elevated Card**:
  * Background: `MaterialTheme.colorScheme.surface` (`#FFFFFF` in light mode).
  * Border: `1.dp` in `SlateLightBorder` (`#E2E8F0`).
  * Corner Radius: `16.dp` (Large).
  * Padding: Standard `16.dp` inner padding.
  * Elevation: Tonal elevation `0.dp` to `2.dp` with clean border stroke.
* **Tonal Highlight Card**:
  * Container: `primaryContainer` with subtle teal or slate tint.
  * Usage: Quick-stat cards, active role indicator, recommendation summary.

### 4.3 Input Fields (Implemented)
* **Outlined Text Field**:
  * Shape: `12.dp` rounded corners.
  * Border: `1.dp` outline in `SlateLightBorder`; switches to `TealAccent` or `NavyPrimary` on active focus.
  * Leading Icon: Standard visual cue (e.g., `Icons.Default.Phone`, `Icons.Default.Lock`).
  * Error State: Border changes to `ErrorColor`, displaying supporting error text below field.
  * Support for numeric keyboard, single-line focus, and explicit visual placeholders.

### 4.4 Top Application Bar (Implemented)
Defined in `/app/src/main/java/com/example/ui/components/AppShell.kt`:
* **Brand Logo**: Dual-tone "Stock" (`NavyPrimary`) + "IQ" (`TealAccent`) display text.
* **Badge**: Compact "BETA" pill container in `primaryContainer` (`10.sp`, Bold).
* **Navigation Icon**: `Icons.AutoMirrored.Filled.ArrowBack` for sub-screens.
* **Actions**: Quick-access icons for Notifications and User Profile.

### 4.5 Bottom Navigation Bar (Implemented)
Defined in `/app/src/main/java/com/example/ui/components/AppShell.kt`:
* **Container**: Clean surface background with `8.dp` tonal elevation.
* **Navigation Items**:
  * **Dashboard**: `Icons.Default.Dashboard` -> routes to main workspace.
  * **Roles**: `Icons.Default.VerifiedUser` -> routes to sandbox role switcher.
  * **Sign Out**: `Icons.Default.ExitToApp` -> executes secure token revocation and navigates to welcome screen.

### 4.6 System State Views (Implemented)
Reusable full-screen and section-level state components in `AppShell.kt`:
1. **Loading State (`StockIQLoadingState`)**:
   * Centered `CircularProgressIndicator` in `TealAccent` (`4.dp` stroke).
   * Contextual loading message (e.g., "Loading secured financial ledger...").
2. **Empty State (`StockIQEmptyState`)**:
   * Centered neutral icon (`Icons.Default.Info`, `64.dp`, 50% opacity).
   * Bold header + descriptive guidance text.
3. **Error State (`StockIQErrorState`)**:
   * Warning icon (`Icons.Default.Warning`, `64.dp`) in `ErrorColor`.
   * Clear error title + actionable message + "Retry" button.
4. **Inline Alerts & Banners**:
   * Tonal banners for OTP dispatches, network warnings, and regulatory notices.

### 4.7 Badges & Regulatory Pills (Implemented)
* **SEBI Verified Badge**: Teal container (`#0D9488`), white text, accompanied by `Icons.Default.Verified`.
* **Classification Badges**: Distinct visual pills for `RETAIL`, `HNI`, `ACCREDITED INVESTOR`, `RESEARCH ANALYST`, and `INVESTMENT ADVISER`.
* **Horizon & Action Tags**: Green badge for "BUY", Red badge for "SELL/SL", Blue badge for "HOLD".

---

## 5. Spacing, Elevation & Layout Grid

### 5.1 Spacing Scale (8dp Grid)
| Spacing Token | Dp Value | Intended Usage |
|---|---|---|
| `space_xxs` | `2.dp` | Inline tag padding, subtle icon offsets |
| `space_xs` | `4.dp` | Badge horizontal padding, tight text offsets |
| `space_sm` | `8.dp` | Standard gap between icon and text, list item vertical padding |
| `space_md` | `12.dp` | Card internal element margins, chip padding |
| `space_lg` | `16.dp` | Standard screen edge margin, card content padding |
| `space_xl` | `24.dp` | Section spacing, form group separators |
| `space_xxl` | `32.dp` | Hero element spacing, major layout block margins |

### 5.2 Corner Radii
* **Small (`8.dp`)**: Badges, status pills, filter chips.
* **Medium (`12.dp`)**: Text input fields, standard buttons.
* **Large (`16.dp`)**: Content cards, modal bottom sheets.
* **Extra Large (`24.dp`)**: Dialog containers, hero banner containers.

---

## 6. Accessibility & Responsive Standards

### 6.1 Accessibility Mandates
* **Touch Target Size**: Minimum interactive component size is strictly **48.dp x 48.dp**.
* **Contrast Ratios**: Body text meets or exceeds WCAG AA standard (minimum 4.5:1 against background).
* **Screen Reader Identity**: Every interactive `IconButton` and `Image` contains a meaningful, non-null `contentDescription`.
* **Scalable Typography**: All text sizes use `sp` units to respect user system-wide font scaling preferences.

### 6.2 Responsive & Adaptive Behavior
* **Phone Layout**: Vertical handheld layout with single-column cards and bottom navigation bar.
* **Tablet / Foldable (Future Standard)**: Max-width content constraints (`widthIn(max = 640.dp)`) centered horizontally to prevent awkward stretching on widescreen devices, adapting bottom navigation to a persistent side Navigation Rail.

---

## 7. Implementation Status Checklist

* **Implemented (Current Baseline)**:
  * Theme colors (`Color.kt`) and M3 scheme configuration (`Theme.kt`).
  * Reusable application scaffold (`StockIQAppShell`).
  * Reusable Loading, Empty, and Error state components.
  * Welcome, Login, Role Selection, and Dashboard screens.
  * TopAppBar with dual-tone logo and "BETA" badge.
  * Bottom navigation bar with Dashboard, Roles, and Sign Out.
* **Future Design Standards (Planned)**:
  * Filterable public directory list cards.
  * Multi-step suitability assessment wizard with dynamic progress bar.
  * Digital agreement viewer with pan/zoom and signature confirmation pad.
  * Real-time recommendation feed cards with live price trigger indicators.
  * Provider performance graph components (Vico charts) with denominator transparency.
