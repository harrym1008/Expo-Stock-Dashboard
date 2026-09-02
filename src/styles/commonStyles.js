import { StyleSheet } from 'react-native';
import { spacing, borderRadius } from '../constants/theme';

// Reusable layout primitives (flex/alignment) shared by many components
export const layoutStyles = StyleSheet.create({
  flex1: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});

// Slide-up bottom sheet layout: dim backdrop, rounded sheet body, header/content
export const modalStyles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  modalOverlayLight: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  // Spacer at top so sheet slides under the app header
  topBackdropGap: { height: 66, width: '100%' },
  sheetContainer: {
    flex: 1,
    borderTopLeftRadius: borderRadius.md + 6,
    borderTopRightRadius: borderRadius.md + 6,
    overflow: 'hidden',
  },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  closeBtn: { padding: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  content: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
});

// Centered dialogue card (TextInputModal, CreatePortfolioModal, alerts)
export const dialogueStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: borderRadius.md + 4,
    borderWidth: 1,
    padding: spacing.xl,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  input: {
    height: 48,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    marginBottom: spacing.xl,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.md,
  },
  button: {
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 84,
  },
  buttonText: { fontSize: 14 },
  submitButtonText: { color: '#FFFFFF' },
});

// Row layout for stock list items (WatchlistItem, SearchResultItem)
export const stockItemStyles = StyleSheet.create({
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    minHeight: 64,
  },
  symbolText: { fontSize: 16, letterSpacing: 0.2 },
  nameText: { fontSize: 12, marginTop: 2 },
  priceText: { fontSize: 17, letterSpacing: 0.2 },
  changeText: { fontSize: 12 },
});

// Centered empty-state layout (icon + title + subtitle)
export const emptyStateStyles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  text: { fontSize: 14 },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 16,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});

// News list + card layout (NewsScreen, StockDetailModal)
export const newsStyles = StyleSheet.create({
  newsList: { gap: spacing.sm + 2 },
  newsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.md,
  },
  newsContent: { flex: 1 },
  newsMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  newsSource: { fontSize: 11 },
  newsDot: { fontSize: 11 },
  newsTime: { fontSize: 11 },
  newsHeadline: { fontSize: 13, lineHeight: 18 },
  newsSummary: { fontSize: 12, lineHeight: 16, marginTop: 4 },
  newsThumbnail: {
    width: 68,
    height: 54,
    borderRadius: borderRadius.sm,
    alignSelf: 'center',
  },
  newsThumbnailPlaceholder: {
    width: 68,
    height: 54,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
});
