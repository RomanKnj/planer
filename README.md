# Planer

Kleine Web-App, um gemeinsam Aktivitäten zu planen: an einem Tag z. B. erst Kino, danach Essen, danach eine Bar, als Zeitleiste mit Uhrzeiten, freier Zeit dazwischen und Kosten.

**Öffnen:** https://romanknj.github.io/planer/

## Gruppe

Beim ersten Öffnen gibst du deinen Namen ein und trittst mit einem Gruppen-Code bei oder legst eine neue Gruppe an. Alle mit demselben Code sehen und bearbeiten dieselben Pläne. Mit „Einladen“ schickst du einen Link, der den Code schon ausfüllt.

Der Code ist der Schlüssel: Wer ihn kennt, kann alles in der Gruppe sehen und ändern. Gib ihn also nur Leuten, mit denen du planst. Dein Name steht an allem, was du einträgst oder änderst.

## Bedienung

1. Im Kalender einen Tag antippen (Tage mit Plänen haben farbige Punkte), oder unter „Als Nächstes“.
2. „+ Aktivität“: Art wählen (Kino, Essen, Bar, Konzert, Sport, Ausflug, Fahrt, Sonstiges), Titel, Beginn, Dauer oder Ende, Ort, Kosten pro Person, Notiz. Eine neue Aktivität beginnt automatisch dort, wo die letzte des Tages endet; die Art schlägt eine übliche Dauer vor.
3. Die Zeitleiste zeigt zwischen zwei Aktivitäten die freie Zeit oder eine Überschneidung, unten Zeitraum und Kosten des Tages.
4. Antippen einer Aktivität öffnet sie zum Ändern oder Löschen. „Tag teilen“ verschickt den Tagesplan als Text.

Änderungen der anderen erscheinen beim Zurückkehren auf die Seite und alle 30 Sekunden.

## Technik

Reines HTML/CSS/JavaScript ohne Build-Schritt. Die Daten liegen in Supabase (Frankfurt), Einrichtung in `supabase.sql` (Tabellen `pl_*`, im selben Projekt wie der Trainingslog). Die Seite darf nur die Funktionen `pl_create_group`, `pl_plan`, `pl_save` und `pl_delete` aufrufen, nicht direkt auf die Tabellen zugreifen. Im Browser gemerkt werden nur Gruppen-Code und Name. Gehostet über GitHub Pages.

Schriften: Rajdhani (Indian Type Foundry) und Share Tech Mono (Carrois Type Design), beide unter der SIL Open Font License 1.1, siehe `fonts/OFL-*.txt`.
