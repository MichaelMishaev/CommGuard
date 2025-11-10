#!/bin/bash

echo "🚀 Disabling Firebase for remaining services (keeping only muted_users)"
echo "======================================================================"

# Services to disable (all except muteService)
SERVICES=(
  "whitelistService.js"
  "kickedUserService.js"
  "unblacklistRequestService.js"
  "motivationalPhraseService.js"
  "groupJokeSettingsService.js"
)

echo ""
echo "Services that will remain MEMORY-ONLY:"
for service in "${SERVICES[@]}"; do
  echo "  - $service"
done

echo ""
echo "Services keeping Firebase:"
echo "  - muteService.js (ONLY)"
echo ""
echo "This will reduce Firebase reads by ~99% on bot restart"
echo "Estimated savings: From ~66,000 reads/restart to ~200 reads/restart"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    exit 1
fi

echo ""
echo "✅ Firebase cost optimization complete!"
echo ""
echo "Summary:"
echo "  - blacklistService: Firebase DISABLED ✅"
echo "  - warningService: Firebase DISABLED ✅"
echo "  - whitelistService: Firebase DISABLED (manual)"
echo "  - kickedUserService: Firebase DISABLED (manual)"
echo "  - unblacklistRequestService: Firebase DISABLED (manual)"
echo "  - motivationalPhraseService: Firebase DISABLED (manual)"
echo "  - groupJokeSettingsService: Firebase DISABLED (manual)"
echo "  - muteService: Firebase ENABLED ✅"
echo ""
echo "Next steps:"
echo "1. Manually disable Firebase in remaining services"
echo "2. Test locally: npm start"
echo "3. Commit changes"
echo "4. Deploy to production: git push"
echo ""
