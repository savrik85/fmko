# Git Workflow & Production Protection

## Zákaz automatického pushování na `main`

- **Pravidlo**: Asistent NIKDY nesmí pushnout, mergnout ani nasadit kód do větve `main` bez předchozího přímého a výslovného souhlasu uživatele (např. „nasaď na main“, „dej na main“, „mergni“).
- Veškerý vývoj a testovací commity smí jít maximálně do větve `testing` (a to také pouze po schválení / výzvě).
- Nikdy neobcházet toto pravidlo ani pro drobné úpravy.
