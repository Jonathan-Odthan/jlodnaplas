# JLODNA As — guide d'intégration

## Contenu
- `api/jlodna-as.js` + `api/_jlodna-as/` : fonction serverless Vercel (aucune dépendance npm, Node 18+)
- `public/jlodna-as/widget.js` : widget de chat (JS pur)
- `public/assets/jlodna-as-avatar.webp|png` : avatar optimisé (copie redimensionnée 512 px ; l'original n'est pas modifié)
- `supabase/jlodna-as.sql` : migration additive (à relire avant exécution)
- `test/mock-test.js` : tests avec faux Supabase / fausse IA (`node test/mock-test.js`)

## Étapes
1. Copie `api/`, `public/jlodna-as/` et `public/assets/*` dans ton projet (fusion, rien à écraser).
2. Exécute `supabase/jlodna-as.sql` dans l'éditeur SQL Supabase. L'assistant est **désactivé** par défaut.
3. Variables d'environnement Vercel (Production + Preview), valeurs à saisir toi-même dans Vercel :
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement ; réutilise tes noms existants si différents)
   - `AI_API_KEY`, `AI_MODEL` ; `AI_PROVIDER=anthropic` (défaut) ou `openai` ; `AI_BASE_URL` optionnel
   - optionnelles : `ALLOWED_ORIGINS`, `PRODUCT_URL_TEMPLATE` (ex. `https://www.jlodna.com/product?slug={slug}` (déjà la valeur par défaut, d'après ton `products.js`)), `RATE_PER_MINUTE`, `RATE_PER_DAY`, `RATE_LIMIT_SALT`
4. (Plus simple, adapté à ton code) copie `public/js/jlodna-as-loader.js` dans `/js/` et ajoute `import('./jlodna-as-loader.js');` à la fin de `initLayout()` dans `js/layout.js`. Il branche le token Supabase via ton `sb` et charge le widget sans bloquer la page. Alternative manuelle :
```html
<script>
  window.JLODNA_AS_CONFIG = {
    loginUrl: '/login.html',                      // ADAPTER : ta vraie page de connexion
    getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token, // ADAPTER à ton client Supabase
    addToCart: async ({ variantId, quantity }) => { /* appelle ta fonction panier existante */ },
    offsetBottom: 16                              // monte-le si le widget gêne un bouton mobile
  };
</script>
<script src="/jlodna-as/widget.js" defer></script>
```
5. Active : `update public.settings set value = jsonb_set(value,'{enabled}','true') where key='assistant';`
6. Renseigne le contact support et les FAQ approuvées dans la ligne `settings.key='assistant'` (`support.email/phone/whatsapp`, `faqs:[{q,a}]`). Sans contact configuré, l'assistant dit qu'il n'en a pas.

## À vérifier / adapter (hypothèses de ma part)
- URL des pages produit (`PRODUCT_URL_TEMPLATE`) et page de connexion : je ne connais pas tes routes.
- Bouton « Ajouter au panier » : branche `addToCart` sur ta logique existante (sinon le client est envoyé vers la page produit).
- La recherche est un filtre texte sur nom/description/SKU (pas de synonymes kreyòl) : l'IA réessaie en français/anglais.
- Prix : formule identique à `effectivePrice` de `js/variants.js` (`v.sale_price ?? v.price ?? p.sale_price ?? p.price`). L'assistant affiche donc les mêmes prix que la boutique.
- Aucune estimation de délai de livraison ni politique de retour n'existe dans ta base : l'assistant le dit, ou utilise les FAQ approuvées.
- Dashboard admin : `admin/js/assistant.js` (à copier dans `/admin/js/`). Ajoute cette ligne dans `ROUTES` de `admin.js`, avant `['audit-logs', ...]` :
  `['assistant', 'Assistant JLODNA As', 'settings.write', 'assistant.js'],`
  Accès : SUPER_ADMIN et ADMIN (permission `settings.write` existante, donc cohérente avec ta policy sur `settings`). Pas de nouvelle permission à créer.
- Non fait dans l'admin : choix de langues (l'assistant détecte kreyòl/français tout seul), journalisation dans `audit_logs` (je ne connais pas ta fonction d'audit), affichage/modification de la clé IA (volontairement Vercel uniquement).

## Tests réels restant à faire (non faits)
Conversations kreyòl/français, vraies recherches, produit épuisé, suivi de commande avec un vrai compte, accès non authentifié, clé IA manquante, panne base, mobile (Android/iPhone), clavier, performance.
