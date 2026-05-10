# SchulSaniApp Development Guidelines

## GitHub Account
- **Username:** Viktor230623-M

## Always use:
- `gh issue create` with Viktor230623-M repo
- `gh pr create` for pull requests
- Commit with Viktor230623-M identity

## SSH Deployment
- Host: 31.97.180.253
- User: root
- Password: abc123

## Deployment Workflow
```bash
cd /var/www/SchulSaniApp
git pull
pnpm --filter api-server build
pm2 restart sani-backend
cd artifacts/paramedic-app
npx expo export --platform web --platform ios --platform android
pm2 restart sani-expo
```

## Testing After Deployment
- Log in with test accounts (viktor.gnjatic / oliver.petz)
- Test all changed features
- Check pm2 logs: `pm2 logs --lines 50`
