#!/bin/bash
# cleanup-next.sh - Nettoie le .next pour la production

echo "🧹 Nettoyage du dossier .next pour la production..."

# Supprimer le cache
rm -rf .next/cache/
echo "✅ Cache supprimé (9 MB)"

# Supprimer la trace
rm .next/trace 2>/dev/null
echo "✅ Trace supprimée (48 KB)"

# Supprimer les fichiers de développement
rm -rf .next/static/development/
echo "✅ Fichiers de développement supprimés"

# Supprimer les fichiers HMR
rm -rf .next/static/webpack/
echo "✅ Fichiers HMR supprimés"

# Supprimer React Refresh
rm .next/static/chunks/react-refresh.js 2>/dev/null
echo "✅ React Refresh supprimé"

# Afficher la taille finale
echo ""
echo "📊 Taille finale:"
du -sh .next/
echo ""
echo "✅ Nettoyage terminé!"
