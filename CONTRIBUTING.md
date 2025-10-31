# Contributing to G-Brain Heist

Thank you for your interest in contributing to G-Brain Heist! This educational game is designed to help students learn through gamification.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/g-brain-heist.git`
3. Install dependencies: `npm install`
4. Create a new branch: `git checkout -b feature/my-new-feature`
5. Make your changes
6. Test your changes: `npm run dev`
7. Build to ensure no errors: `npm run build`
8. Commit your changes: `git commit -m 'Add some feature'`
9. Push to your fork: `git push origin feature/my-new-feature`
10. Open a Pull Request

## Development Guidelines

### Code Style
- Use TypeScript for all new files
- Follow existing naming conventions
- Use functional components with hooks (no class components except ErrorBoundary)
- Keep components small and focused

### Adding New Features
- Add new game mechanics in `services/gameService.ts`
- Create UI components in `components/`
- Update types in `types.ts` when adding new data structures
- Test with localStorage to ensure persistence works

### Educational Content
- Questions should be age-appropriate
- Include explanations for incorrect answers
- Balance difficulty progression
- Avoid controversial or sensitive topics

## Areas for Contribution

### High Priority
- [ ] More diverse question sets
- [ ] Accessibility improvements (screen readers, keyboard nav)
- [ ] Mobile UI enhancements
- [ ] Offline PWA support

### Medium Priority
- [ ] Achievement system
- [ ] More cosmetic items
- [ ] Sound effects and music
- [ ] Animated tutorials

### Backend Integration (Advanced)
- [ ] REST API design
- [ ] Real multiplayer support
- [ ] Leaderboards across users
- [ ] Admin dashboard for educators

## Testing

Currently, the project uses manual testing. When adding features:
1. Test on Chrome, Firefox, and Safari
2. Test on mobile devices
3. Test localStorage persistence
4. Test error scenarios

## Questions?

Open an issue or reach out to the maintainers!
