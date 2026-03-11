# Afdelingsundersider
I dette kapitel vil alle undersiderne tilgængelige under en afdeling blive introduceret og forklaret. Hvis du kun er tilknyttet én afdeling, vil du automatisk blive sendt herhen når du logger ind. Hvis du har adgang til flere afdelinger, så kan du se hvordan du vælger en specifik afdeling her: [Medarbejdervisning](#03_Organisation_Overview#31-medarbejdervisning). 


## Navigationsmenu
Efter at have valgt en afdeling, vil navigations menuen ændre sig. Nu vil navigations menuen vise en knap til højre, hvor der står hvilken afdeling du har valgt. Denne knap kan trykkes på for at skifte afdeling. Udover det, så vil der stå følgende menupunkter:

* **Dashboard:** En overbliks side over, hvad der foregår på afdelingen lige nu
* **Indhold:** Denne side er en oversigts side over oprettet indhold. Herfra kan man åbne, oprette og slette indhold.
* **Afspilningslister:** En side hvor man kan sammensætte slideshows til afspilningslister.
* **Administrer Skærme:** På denne side tilkobler man skærme til systemet og tildeler dem indhold, samt et kalendersystem, hvor man kan planlægge indhold.
* **Dokumentation:** *(Denne side)* Dokumentations siden.

![Afdelings Navigationsmenu](/docs/docs_images/da/branch_navbar_da.png)

## Dashboard
Denne første side, der bliver vist efter man har åbnet en afdeling, er dashboardet. På denne side, kan man se de senest redigerede indhold og afspilningslister, og åbne dem hurtigt uden at skulle tilgå indholds siden og finde det frem manuelt. Samtidig med dette er der en oversigt over, hvilket indhold bliver afspillet på skærmene lige nu og hvad der er planlagt som det næste.

![Afdelings Navigationsmenu](/docs/docs_images/da/dashboard_da.png)

## Indhold
Denne side viser en oversigt over oprettet indhold og giver mulighed for at oprette, redigere, duplikere eller slette indhold.

### Find eksisterende indhold
Du kan søge efter indhold via navn, tilstand *(slideshow eller interaktiv)*, billedformat *(eks. 16:9 eller 4:3)*, tags eller kategori. Derudover kan du i venstre sidepanel filtrere på kategorier og tilstand. 

![Find Eksisterende Indhold](/docs/docs_images/da/find_existing_content_da.png)

### Rediger eksisterende indhold
![Rediger Eksisterende Indhold](/docs/docs_images/da/edit_existing_content_da.png)

#### Rediger metadata
For at ændre metadata (f.eks. navn, kategori eller tags) klik på blyant-ikonet ved det felt, du vil redigere. Ændringerne gemmes, når du bekræfter redigeringen.

#### Åbn indhold
Klik på "Åbn" under handlinger for at åbne indholdet i editoren. Editoren bliver forklaret i afsnittet [Redigér Indhold.](#07_Edit_Content)

#### Dupliker indhold
Klik på "Dupliker" for at lave en kopi. Den nye kopi får samme navn som originalen med "(Kopi)" tilføjet.

#### Slet indhold
Klik på "Slet" under handlinger og bekræft for at fjerne indholdet. Bemærk: Hvis indholdet allerede er tildelt skærme, vil de blive tomme, når indholdet slettes.

### Opret indhold
Klik på "Tilføj indhold" øverst til venstre for at oprette nyt indhold.

![Tilføj indhold](/docs/docs_images/da/add_content_da.png)

Efter klik åbnes en dialog med flere indstillinger. Disse indstillinger bliver herunder forklaret:

##### Navngiv indhold
Indtast navnet på indholdet i tekstfeltet "Navn".

##### Vælg tilstand
Vælg mellem to tilstande: "Slideshow" og "Interaktiv". Tilstanden vælges i en dropdown og kan ikke ændres efter oprettelse.

**Slideshow:** I denne tilstand bygger du et slideshow med slides, hvor du indsætter indhold, vælger rækkefølge og angiver visningstid for hver slide. 
<!-- To do - Tilføj denne linje, når afsnittet eksisterer: "Se afsnittet om slideshow for detaljer." -->

**Interaktiv:** I denne tilstand opretter du interaktive sider, fx til touchskærme. Elementer kan konfigureres som knapper, der navigerer mellem sider.
<!-- To do - Tilføj denne linje, når afsnittet eksisterer: "Se afsnittet om interaktivt indhold for detaljer." -->

##### Størrelsesforhold (Aspect ratio)
Vælg det billedformat, indholdet skal vises i (fx 16:9 til bredformat eller 9:16 til højformat). Indhold skal oprettes med henblik på hvilket størrelsesforhold den skærm / de skærme, som skal vise indholdet har.

##### Gem
Klik på "Opret indhold" når du er færdig. Efter oprettelsen får du mulighed for enten at gå direkte til editoren eller blive på oversigtssiden.

## Afspilningslister
![Tilføj indhold](/docs/docs_images/da/playlists_da.png)

Denne side bruges til at oprette og administrere afspilningslister bestående af slideshows.
Formålet er at samle flere slideshows i en rækkefølge, som derefter kan tildeles skærme eller planlægges i tidsplaner.

**Layout og hovedfunktioner**
- Venstre sidepanel viser alle oprettede afspilningslister i en liste. Knappen "Tilføj Playlist" øverst åbner en modal til oprettelse af en ny afspilningsliste.
- Når en afspilningsliste er valgt, viser hovedområdet navnet på den valgte playlist og to handlinger: "Omdøb Afspilningsliste" og "Tilføj indhold til afspilningsliste".
- Hvis ingen playlist er valgt, vises en vejledende tekst "Ingen Afspilningsliste valgt. Tilføj eller vælg en afspilningsliste" i hovedområdet.

**Redigeringssektion**
- Når en afspilningsliste er valgt, kan du se og redigere rækkefølgen af slideshows i tabelformat. Tabellen viser hver række med forløb (slideshow), position og en kolonne til handlinger (fx fjern eller flyt).
- Rækkefølge kan ændres ved hjælp af træk-og-slip i tabellen — du kan dermed justere positionen af hvert slideshow i playlisten.


## Håndter skærme

![Håndter Skærme](/docs/docs_images/da/manage_displays.png)

Siden "Håndter skærme" er opdelt i et sidepanel til venstre og en kalender til højre. Sidepanelet bruges til at oprette og vedligeholde skærmgrupper og skærme, mens kalenderen viser planlagt indhold for de grupper du markerer.

**Begreber**
- En *gruppe* samler én eller flere skærme, der skal vise det samme indhold og deler samme billedformat. Du styrer standardindhold, planlagte afspilninger og metadata på gruppeniveau.

- En *skærm* er den fysiske klient, som registreres i OpenStream. Skærmen bliver tilknyttet med et bestemt størrelesforhold, og det er brugerens ansvar at indsætte det rigtige størrelsesforhold i OpenStream når skærmen bliver registreret.
- Efter en skærm er blevet registreret, skal den tilknyttes en gruppe for at vise indhold.

### Sidepanel: grupper og skærme
#### Tilføj skærmgruppe
Tryk på **Tilføj skærmgruppe** for at oprette en ny skærmgruppe. I dialogen vælger du navn, billedformat (aspect ratio) og standardindhold. Når du klikker på blyantsknappen i listen af skærme, åbnes en dialogboks hvor det er muligt at omdøbe, ændre format eller justere standardindhold.

![Tilføj Gruppe](/docs/docs_images/da/add_group_btn.png)
![Tilføj Gruppe](/docs/docs_images/da/add_group.png)

#### Registrer skærm
Vælg **Registrer Skærm** for at åbne registreringsdialogen og kopiere enten registrerings-URL eller API-nøgle til eksterne værktøjer som OS2BorgerPC.

![Tilføj skærm knap](/docs/docs_images/da/register_screen.png)

![Tilføj skærm](/docs/docs_images/da/screen_registration_dialog.png)

Efter en skærm er blevet registret, vil den automatisk blive vist i bunden af den venstre sidemenu i "Inaktive Skærme". For at give skærmen noget indhold skal den bare trækkes op i en skærmgruppe som har indhold tilknyttet.

![Inaktive skærme](/docs/docs_images/da/inactive_screen.png)


### Standardindhold for grupper
- Hver gruppe har standardindhold, som afspilles når der ikke er planlagte afvigelser. Vælg mellem enkelt slideshows/interaktivt indhold eller en samlet slideshow-playlist.
- Redigér standardindholdet for en gruppe ved at klikke på blyantsikonet ved siden af gruppen.

![Standard indhold](/docs/docs_images/da/edit_group.png)

### Planlæg indhold i kalenderen
- Kalenderen fylder hovedområdet og viser alle planlagte afspilninger for de valgte grupper.
- Brug **Tilføj planlagt indhold** knappen eller træk musen hen over kalenderen til engangsbegivenheder på bestemte datoer og tidspunkter.Vælg om indholdet skal erstatte standardindholdet eller afspilles i kombination.
![Scheduled Content](/docs/docs_images/da/add_scheduled_content_btn.png)
![Scheduled Content](/docs/docs_images/da/add_scheduled_content_modal.png)

- Brug **Tilføj Tilbagevendene Indhold** knappen til tilbagevendende planlægning, f.eks. hver mandag kl. 10:00-12:00. Tilbagevendende kan tilføjes i kombinations tilstand eller overskrivningstilstand.
- Det er muligt at kombinere flere ting i kalenderen på samme tid.

![Recurring Content](/docs/docs_images/da/recurring_content.png)
![Recurring Content](/docs/docs_images/da/recurring_content_modal.png)


### Vedligeholdelse af skærme
- Eksisterende begivenheder kan redigeres eller slettes ved at trykke på dem i kalenderen.
- Der skal vælges det samme billedformat på skærmen og i gruppen, ellers blokerer programmet for at tilføje en skærm til en skærmgruppe.
- Hvis et display skal skifte billedformat, fjern det fra sin nuværende gruppe og tilføj den til tilbage til "Inaktive Skærme". Når skærmen er inaktiv kan du ændre dens størrelsesforhold.