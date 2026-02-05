/**
 * US County Data for State QSO Party Contests
 *
 * Contains county abbreviations and names for states that sponsor
 * major QSO party contests: California, Texas, Pennsylvania, Florida, and Ohio.
 *
 * County abbreviations follow the standard codes used in each state's
 * QSO party contest rules.
 *
 * @module lib/data/counties
 */

// ============================================================================
// Types
// ============================================================================

export interface CountyEntry {
  /** Full county name */
  name: string;
  /** Standard abbreviation used in contest exchanges */
  abbr: string;
}

// ============================================================================
// County Data
// ============================================================================

/**
 * County data organized by US state code
 *
 * Keys are 2-letter state abbreviations. Values are arrays of county
 * entries with name and standard contest abbreviation.
 */
export const COUNTY_DATA: Record<string, CountyEntry[]> = {
  // ========================================================================
  // California - 58 counties
  // Used in California QSO Party (CQP)
  // ========================================================================
  CA: [
    { name: "Alameda", abbr: "ALAM" },
    { name: "Alpine", abbr: "ALPI" },
    { name: "Amador", abbr: "AMAD" },
    { name: "Butte", abbr: "BUTT" },
    { name: "Calaveras", abbr: "CALA" },
    { name: "Colusa", abbr: "COLU" },
    { name: "Contra Costa", abbr: "CCOS" },
    { name: "Del Norte", abbr: "DNOR" },
    { name: "El Dorado", abbr: "ELDO" },
    { name: "Fresno", abbr: "FRES" },
    { name: "Glenn", abbr: "GLEN" },
    { name: "Humboldt", abbr: "HUMB" },
    { name: "Imperial", abbr: "IMPE" },
    { name: "Inyo", abbr: "INYO" },
    { name: "Kern", abbr: "KERN" },
    { name: "Kings", abbr: "KING" },
    { name: "Lake", abbr: "LAKE" },
    { name: "Lassen", abbr: "LASS" },
    { name: "Los Angeles", abbr: "LANG" },
    { name: "Madera", abbr: "MADE" },
    { name: "Marin", abbr: "MARN" },
    { name: "Mariposa", abbr: "MARI" },
    { name: "Mendocino", abbr: "MEND" },
    { name: "Merced", abbr: "MERC" },
    { name: "Modoc", abbr: "MODO" },
    { name: "Mono", abbr: "MONO" },
    { name: "Monterey", abbr: "MONT" },
    { name: "Napa", abbr: "NAPA" },
    { name: "Nevada", abbr: "NEVA" },
    { name: "Orange", abbr: "ORAN" },
    { name: "Placer", abbr: "PLAC" },
    { name: "Plumas", abbr: "PLUM" },
    { name: "Riverside", abbr: "RIVE" },
    { name: "Sacramento", abbr: "SACR" },
    { name: "San Benito", abbr: "SBEN" },
    { name: "San Bernardino", abbr: "SBER" },
    { name: "San Diego", abbr: "SDIE" },
    { name: "San Francisco", abbr: "SFRA" },
    { name: "San Joaquin", abbr: "SJOA" },
    { name: "San Luis Obispo", abbr: "SLUI" },
    { name: "San Mateo", abbr: "SMAT" },
    { name: "Santa Barbara", abbr: "SBAR" },
    { name: "Santa Clara", abbr: "SCLA" },
    { name: "Santa Cruz", abbr: "SCRU" },
    { name: "Shasta", abbr: "SHAS" },
    { name: "Sierra", abbr: "SIER" },
    { name: "Siskiyou", abbr: "SISK" },
    { name: "Solano", abbr: "SOLA" },
    { name: "Sonoma", abbr: "SONO" },
    { name: "Stanislaus", abbr: "STAN" },
    { name: "Sutter", abbr: "SUTT" },
    { name: "Tehama", abbr: "TEHA" },
    { name: "Trinity", abbr: "TRIN" },
    { name: "Tulare", abbr: "TULA" },
    { name: "Tuolumne", abbr: "TUOL" },
    { name: "Ventura", abbr: "VENT" },
    { name: "Yolo", abbr: "YOLO" },
    { name: "Yuba", abbr: "YUBA" },
  ],

  // ========================================================================
  // Texas - 254 counties
  // Used in Texas QSO Party (TQP)
  // ========================================================================
  TX: [
    { name: "Anderson", abbr: "ANDE" },
    { name: "Andrews", abbr: "ANDR" },
    { name: "Angelina", abbr: "ANGE" },
    { name: "Aransas", abbr: "ARAN" },
    { name: "Archer", abbr: "ARCH" },
    { name: "Armstrong", abbr: "ARMS" },
    { name: "Atascosa", abbr: "ATAS" },
    { name: "Austin", abbr: "AUST" },
    { name: "Bailey", abbr: "BAIL" },
    { name: "Bandera", abbr: "BAND" },
    { name: "Bastrop", abbr: "BAST" },
    { name: "Baylor", abbr: "BAYL" },
    { name: "Bee", abbr: "BEE" },
    { name: "Bell", abbr: "BELL" },
    { name: "Bexar", abbr: "BEXA" },
    { name: "Blanco", abbr: "BLAN" },
    { name: "Borden", abbr: "BORD" },
    { name: "Bosque", abbr: "BOSQ" },
    { name: "Bowie", abbr: "BOWI" },
    { name: "Brazoria", abbr: "BRAZ" },
    { name: "Brazos", abbr: "BRZO" },
    { name: "Brewster", abbr: "BREW" },
    { name: "Briscoe", abbr: "BRIS" },
    { name: "Brooks", abbr: "BROO" },
    { name: "Brown", abbr: "BROW" },
    { name: "Burleson", abbr: "BURL" },
    { name: "Burnet", abbr: "BURN" },
    { name: "Caldwell", abbr: "CALD" },
    { name: "Calhoun", abbr: "CALH" },
    { name: "Callahan", abbr: "CALL" },
    { name: "Cameron", abbr: "CAME" },
    { name: "Camp", abbr: "CAMP" },
    { name: "Carson", abbr: "CARS" },
    { name: "Cass", abbr: "CASS" },
    { name: "Castro", abbr: "CAST" },
    { name: "Chambers", abbr: "CHAM" },
    { name: "Cherokee", abbr: "CHER" },
    { name: "Childress", abbr: "CHIL" },
    { name: "Clay", abbr: "CLAY" },
    { name: "Cochran", abbr: "COCH" },
    { name: "Coke", abbr: "COKE" },
    { name: "Coleman", abbr: "COLE" },
    { name: "Collin", abbr: "COLL" },
    { name: "Collingsworth", abbr: "CLNG" },
    { name: "Colorado", abbr: "COLO" },
    { name: "Comal", abbr: "COMA" },
    { name: "Comanche", abbr: "COMC" },
    { name: "Concho", abbr: "CONC" },
    { name: "Cooke", abbr: "COOK" },
    { name: "Coryell", abbr: "CORY" },
    { name: "Cottle", abbr: "COTT" },
    { name: "Crane", abbr: "CRAN" },
    { name: "Crockett", abbr: "CROC" },
    { name: "Crosby", abbr: "CROS" },
    { name: "Culberson", abbr: "CULB" },
    { name: "Dallam", abbr: "DALA" },
    { name: "Dallas", abbr: "DALL" },
    { name: "Dawson", abbr: "DAWS" },
    { name: "Deaf Smith", abbr: "DSMI" },
    { name: "Delta", abbr: "DELT" },
    { name: "Denton", abbr: "DENT" },
    { name: "DeWitt", abbr: "DEWI" },
    { name: "Dickens", abbr: "DICK" },
    { name: "Dimmit", abbr: "DIMM" },
    { name: "Donley", abbr: "DONL" },
    { name: "Duval", abbr: "DUVA" },
    { name: "Eastland", abbr: "EAST" },
    { name: "Ector", abbr: "ECTO" },
    { name: "Edwards", abbr: "EDWA" },
    { name: "Ellis", abbr: "ELLI" },
    { name: "El Paso", abbr: "ELPA" },
    { name: "Erath", abbr: "ERAT" },
    { name: "Falls", abbr: "FALL" },
    { name: "Fannin", abbr: "FANN" },
    { name: "Fayette", abbr: "FAYE" },
    { name: "Fisher", abbr: "FISH" },
    { name: "Floyd", abbr: "FLOY" },
    { name: "Foard", abbr: "FOAR" },
    { name: "Fort Bend", abbr: "FBEN" },
    { name: "Franklin", abbr: "FRAN" },
    { name: "Freestone", abbr: "FREE" },
    { name: "Frio", abbr: "FRIO" },
    { name: "Gaines", abbr: "GAIN" },
    { name: "Galveston", abbr: "GALV" },
    { name: "Garza", abbr: "GARZ" },
    { name: "Gillespie", abbr: "GILL" },
    { name: "Glasscock", abbr: "GLAS" },
    { name: "Goliad", abbr: "GOLI" },
    { name: "Gonzales", abbr: "GONZ" },
    { name: "Gray", abbr: "GRAY" },
    { name: "Grayson", abbr: "GRYS" },
    { name: "Gregg", abbr: "GREG" },
    { name: "Grimes", abbr: "GRIM" },
    { name: "Guadalupe", abbr: "GUAD" },
    { name: "Hale", abbr: "HALE" },
    { name: "Hall", abbr: "HALL" },
    { name: "Hamilton", abbr: "HAMI" },
    { name: "Hansford", abbr: "HANS" },
    { name: "Hardeman", abbr: "HARD" },
    { name: "Hardin", abbr: "HDIN" },
    { name: "Harris", abbr: "HARR" },
    { name: "Harrison", abbr: "HRSN" },
    { name: "Hartley", abbr: "HART" },
    { name: "Haskell", abbr: "HASK" },
    { name: "Hays", abbr: "HAYS" },
    { name: "Hemphill", abbr: "HEMP" },
    { name: "Henderson", abbr: "HEND" },
    { name: "Hidalgo", abbr: "HIDA" },
    { name: "Hill", abbr: "HILL" },
    { name: "Hockley", abbr: "HOCK" },
    { name: "Hood", abbr: "HOOD" },
    { name: "Hopkins", abbr: "HOPK" },
    { name: "Houston", abbr: "HOUS" },
    { name: "Howard", abbr: "HOWA" },
    { name: "Hudspeth", abbr: "HUDS" },
    { name: "Hunt", abbr: "HUNT" },
    { name: "Hutchinson", abbr: "HUTC" },
    { name: "Irion", abbr: "IRIO" },
    { name: "Jack", abbr: "JACK" },
    { name: "Jackson", abbr: "JKSN" },
    { name: "Jasper", abbr: "JASP" },
    { name: "Jeff Davis", abbr: "JDAV" },
    { name: "Jefferson", abbr: "JEFF" },
    { name: "Jim Hogg", abbr: "JHOG" },
    { name: "Jim Wells", abbr: "JWEL" },
    { name: "Johnson", abbr: "JOHN" },
    { name: "Jones", abbr: "JONE" },
    { name: "Karnes", abbr: "KARN" },
    { name: "Kaufman", abbr: "KAUF" },
    { name: "Kendall", abbr: "KEND" },
    { name: "Kenedy", abbr: "KENE" },
    { name: "Kent", abbr: "KENT" },
    { name: "Kerr", abbr: "KERR" },
    { name: "Kimble", abbr: "KIMB" },
    { name: "King", abbr: "KING" },
    { name: "Kinney", abbr: "KINN" },
    { name: "Kleberg", abbr: "KLEB" },
    { name: "Knox", abbr: "KNOX" },
    { name: "Lamar", abbr: "LAMA" },
    { name: "Lamb", abbr: "LAMB" },
    { name: "Lampasas", abbr: "LAMP" },
    { name: "La Salle", abbr: "LSAL" },
    { name: "Lavaca", abbr: "LAVA" },
    { name: "Lee", abbr: "LEE" },
    { name: "Leon", abbr: "LEON" },
    { name: "Liberty", abbr: "LIBE" },
    { name: "Limestone", abbr: "LIME" },
    { name: "Lipscomb", abbr: "LIPS" },
    { name: "Live Oak", abbr: "LOAK" },
    { name: "Llano", abbr: "LLAN" },
    { name: "Loving", abbr: "LOVI" },
    { name: "Lubbock", abbr: "LUBB" },
    { name: "Lynn", abbr: "LYNN" },
    { name: "McCulloch", abbr: "MCCU" },
    { name: "McLennan", abbr: "MCLE" },
    { name: "McMullen", abbr: "MCMU" },
    { name: "Madison", abbr: "MADI" },
    { name: "Marion", abbr: "MARN" },
    { name: "Martin", abbr: "MART" },
    { name: "Mason", abbr: "MASO" },
    { name: "Matagorda", abbr: "MATA" },
    { name: "Maverick", abbr: "MAVE" },
    { name: "Medina", abbr: "MEDI" },
    { name: "Menard", abbr: "MENA" },
    { name: "Midland", abbr: "MIDL" },
    { name: "Milam", abbr: "MILA" },
    { name: "Mills", abbr: "MILL" },
    { name: "Mitchell", abbr: "MITC" },
    { name: "Montague", abbr: "MNTG" },
    { name: "Montgomery", abbr: "MGMY" },
    { name: "Moore", abbr: "MOOR" },
    { name: "Morris", abbr: "MORR" },
    { name: "Motley", abbr: "MOTL" },
    { name: "Nacogdoches", abbr: "NACO" },
    { name: "Navarro", abbr: "NAVA" },
    { name: "Newton", abbr: "NEWT" },
    { name: "Nolan", abbr: "NOLA" },
    { name: "Nueces", abbr: "NUEC" },
    { name: "Ochiltree", abbr: "OCHI" },
    { name: "Oldham", abbr: "OLDH" },
    { name: "Orange", abbr: "ORAN" },
    { name: "Palo Pinto", abbr: "PPIN" },
    { name: "Panola", abbr: "PANO" },
    { name: "Parker", abbr: "PARK" },
    { name: "Parmer", abbr: "PARM" },
    { name: "Pecos", abbr: "PECO" },
    { name: "Polk", abbr: "POLK" },
    { name: "Potter", abbr: "POTT" },
    { name: "Presidio", abbr: "PRES" },
    { name: "Rains", abbr: "RAIN" },
    { name: "Randall", abbr: "RAND" },
    { name: "Reagan", abbr: "REAG" },
    { name: "Real", abbr: "REAL" },
    { name: "Red River", abbr: "RRIV" },
    { name: "Reeves", abbr: "REEV" },
    { name: "Refugio", abbr: "REFU" },
    { name: "Roberts", abbr: "ROBE" },
    { name: "Robertson", abbr: "ROBN" },
    { name: "Rockwall", abbr: "ROCK" },
    { name: "Runnels", abbr: "RUNN" },
    { name: "Rusk", abbr: "RUSK" },
    { name: "Sabine", abbr: "SABI" },
    { name: "San Augustine", abbr: "SAUG" },
    { name: "San Jacinto", abbr: "SJAC" },
    { name: "San Patricio", abbr: "SPAT" },
    { name: "San Saba", abbr: "SSAB" },
    { name: "Schleicher", abbr: "SCHL" },
    { name: "Scurry", abbr: "SCUR" },
    { name: "Shackelford", abbr: "SHAC" },
    { name: "Shelby", abbr: "SHEL" },
    { name: "Sherman", abbr: "SHER" },
    { name: "Smith", abbr: "SMIT" },
    { name: "Somervell", abbr: "SOME" },
    { name: "Starr", abbr: "STAR" },
    { name: "Stephens", abbr: "STEP" },
    { name: "Sterling", abbr: "STER" },
    { name: "Stonewall", abbr: "STON" },
    { name: "Sutton", abbr: "SUTT" },
    { name: "Swisher", abbr: "SWIS" },
    { name: "Tarrant", abbr: "TARR" },
    { name: "Taylor", abbr: "TAYL" },
    { name: "Terrell", abbr: "TERR" },
    { name: "Terry", abbr: "TERY" },
    { name: "Throckmorton", abbr: "THRO" },
    { name: "Titus", abbr: "TITU" },
    { name: "Tom Green", abbr: "TGRN" },
    { name: "Travis", abbr: "TRAV" },
    { name: "Trinity", abbr: "TRIN" },
    { name: "Tyler", abbr: "TYLE" },
    { name: "Upshur", abbr: "UPSH" },
    { name: "Upton", abbr: "UPTO" },
    { name: "Uvalde", abbr: "UVAL" },
    { name: "Val Verde", abbr: "VVER" },
    { name: "Van Zandt", abbr: "VZAN" },
    { name: "Victoria", abbr: "VICT" },
    { name: "Walker", abbr: "WALK" },
    { name: "Waller", abbr: "WALL" },
    { name: "Ward", abbr: "WARD" },
    { name: "Washington", abbr: "WASH" },
    { name: "Webb", abbr: "WEBB" },
    { name: "Wharton", abbr: "WHAR" },
    { name: "Wheeler", abbr: "WHEE" },
    { name: "Wichita", abbr: "WICH" },
    { name: "Wilbarger", abbr: "WILB" },
    { name: "Willacy", abbr: "WLCY" },
    { name: "Williamson", abbr: "WMSN" },
    { name: "Wilson", abbr: "WILS" },
    { name: "Winkler", abbr: "WINK" },
    { name: "Wise", abbr: "WISE" },
    { name: "Wood", abbr: "WOOD" },
    { name: "Yoakum", abbr: "YOAK" },
    { name: "Young", abbr: "YOUN" },
    { name: "Zapata", abbr: "ZAPA" },
    { name: "Zavala", abbr: "ZAVA" },
  ],

  // ========================================================================
  // Pennsylvania - 67 counties
  // Used in Pennsylvania QSO Party (PAQP)
  // ========================================================================
  PA: [
    { name: "Adams", abbr: "ADAM" },
    { name: "Allegheny", abbr: "ALLE" },
    { name: "Armstrong", abbr: "ARMS" },
    { name: "Beaver", abbr: "BEAV" },
    { name: "Bedford", abbr: "BEDF" },
    { name: "Berks", abbr: "BERK" },
    { name: "Blair", abbr: "BLAI" },
    { name: "Bradford", abbr: "BRAD" },
    { name: "Bucks", abbr: "BUCK" },
    { name: "Butler", abbr: "BUTL" },
    { name: "Cambria", abbr: "CAMB" },
    { name: "Cameron", abbr: "CAME" },
    { name: "Carbon", abbr: "CARB" },
    { name: "Centre", abbr: "CENT" },
    { name: "Chester", abbr: "CHES" },
    { name: "Clarion", abbr: "CLRN" },
    { name: "Clearfield", abbr: "CLRF" },
    { name: "Clinton", abbr: "CLIN" },
    { name: "Columbia", abbr: "COLU" },
    { name: "Crawford", abbr: "CRAW" },
    { name: "Cumberland", abbr: "CUMB" },
    { name: "Dauphin", abbr: "DAUP" },
    { name: "Delaware", abbr: "DELA" },
    { name: "Elk", abbr: "ELK" },
    { name: "Erie", abbr: "ERIE" },
    { name: "Fayette", abbr: "FAYE" },
    { name: "Forest", abbr: "FORE" },
    { name: "Franklin", abbr: "FRAN" },
    { name: "Fulton", abbr: "FULT" },
    { name: "Greene", abbr: "GREE" },
    { name: "Huntingdon", abbr: "HUNT" },
    { name: "Indiana", abbr: "INDI" },
    { name: "Jefferson", abbr: "JEFF" },
    { name: "Juniata", abbr: "JUNI" },
    { name: "Lackawanna", abbr: "LACK" },
    { name: "Lancaster", abbr: "LANC" },
    { name: "Lawrence", abbr: "LAWR" },
    { name: "Lebanon", abbr: "LEBA" },
    { name: "Lehigh", abbr: "LEHI" },
    { name: "Luzerne", abbr: "LUZE" },
    { name: "Lycoming", abbr: "LYCO" },
    { name: "McKean", abbr: "MCKE" },
    { name: "Mercer", abbr: "MERC" },
    { name: "Mifflin", abbr: "MIFF" },
    { name: "Monroe", abbr: "MONR" },
    { name: "Montgomery", abbr: "MGMY" },
    { name: "Montour", abbr: "MNTR" },
    { name: "Northampton", abbr: "NAMP" },
    { name: "Northumberland", abbr: "NUMB" },
    { name: "Perry", abbr: "PERR" },
    { name: "Philadelphia", abbr: "PHIL" },
    { name: "Pike", abbr: "PIKE" },
    { name: "Potter", abbr: "POTT" },
    { name: "Schuylkill", abbr: "SCHU" },
    { name: "Snyder", abbr: "SNYD" },
    { name: "Somerset", abbr: "SOME" },
    { name: "Sullivan", abbr: "SULL" },
    { name: "Susquehanna", abbr: "SUSQ" },
    { name: "Tioga", abbr: "TIOG" },
    { name: "Union", abbr: "UNIO" },
    { name: "Venango", abbr: "VENA" },
    { name: "Warren", abbr: "WARR" },
    { name: "Washington", abbr: "WASH" },
    { name: "Wayne", abbr: "WAYN" },
    { name: "Westmoreland", abbr: "WEST" },
    { name: "Wyoming", abbr: "WYOM" },
    { name: "York", abbr: "YORK" },
  ],

  // ========================================================================
  // Florida - 67 counties
  // Used in Florida QSO Party (FQP)
  // ========================================================================
  FL: [
    { name: "Alachua", abbr: "ALA" },
    { name: "Baker", abbr: "BAK" },
    { name: "Bay", abbr: "BAY" },
    { name: "Bradford", abbr: "BRA" },
    { name: "Brevard", abbr: "BRE" },
    { name: "Broward", abbr: "BRO" },
    { name: "Calhoun", abbr: "CAL" },
    { name: "Charlotte", abbr: "CHA" },
    { name: "Citrus", abbr: "CIT" },
    { name: "Clay", abbr: "CLA" },
    { name: "Collier", abbr: "CLR" },
    { name: "Columbia", abbr: "COL" },
    { name: "DeSoto", abbr: "DES" },
    { name: "Dixie", abbr: "DIX" },
    { name: "Duval", abbr: "DUV" },
    { name: "Escambia", abbr: "ESC" },
    { name: "Flagler", abbr: "FLA" },
    { name: "Franklin", abbr: "FRN" },
    { name: "Gadsden", abbr: "GAD" },
    { name: "Gilchrist", abbr: "GIL" },
    { name: "Glades", abbr: "GLA" },
    { name: "Gulf", abbr: "GUL" },
    { name: "Hamilton", abbr: "HAM" },
    { name: "Hardee", abbr: "HAR" },
    { name: "Hendry", abbr: "HEN" },
    { name: "Hernando", abbr: "HER" },
    { name: "Highlands", abbr: "HIG" },
    { name: "Hillsborough", abbr: "HIL" },
    { name: "Holmes", abbr: "HOL" },
    { name: "Indian River", abbr: "IND" },
    { name: "Jackson", abbr: "JAC" },
    { name: "Jefferson", abbr: "JEF" },
    { name: "Lafayette", abbr: "LAF" },
    { name: "Lake", abbr: "LAK" },
    { name: "Lee", abbr: "LEE" },
    { name: "Leon", abbr: "LEO" },
    { name: "Levy", abbr: "LEV" },
    { name: "Liberty", abbr: "LIB" },
    { name: "Madison", abbr: "MAD" },
    { name: "Manatee", abbr: "MAN" },
    { name: "Marion", abbr: "MRN" },
    { name: "Martin", abbr: "MRT" },
    { name: "Miami-Dade", abbr: "DAD" },
    { name: "Monroe", abbr: "MON" },
    { name: "Nassau", abbr: "NAS" },
    { name: "Okaloosa", abbr: "OKA" },
    { name: "Okeechobee", abbr: "OKE" },
    { name: "Orange", abbr: "ORA" },
    { name: "Osceola", abbr: "OSC" },
    { name: "Palm Beach", abbr: "PAL" },
    { name: "Pasco", abbr: "PAS" },
    { name: "Pinellas", abbr: "PIN" },
    { name: "Polk", abbr: "POL" },
    { name: "Putnam", abbr: "PUT" },
    { name: "Santa Rosa", abbr: "SAN" },
    { name: "Sarasota", abbr: "SAR" },
    { name: "Seminole", abbr: "SEM" },
    { name: "St. Johns", abbr: "STJ" },
    { name: "St. Lucie", abbr: "STL" },
    { name: "Sumter", abbr: "SUM" },
    { name: "Suwannee", abbr: "SUW" },
    { name: "Taylor", abbr: "TAY" },
    { name: "Union", abbr: "UNI" },
    { name: "Volusia", abbr: "VOL" },
    { name: "Wakulla", abbr: "WAK" },
    { name: "Walton", abbr: "WAL" },
    { name: "Washington", abbr: "WAS" },
  ],

  // ========================================================================
  // Ohio - 88 counties
  // Used in Ohio QSO Party (OhQP)
  // ========================================================================
  OH: [
    { name: "Adams", abbr: "ADAM" },
    { name: "Allen", abbr: "ALLE" },
    { name: "Ashland", abbr: "ASHL" },
    { name: "Ashtabula", abbr: "ASHT" },
    { name: "Athens", abbr: "ATHE" },
    { name: "Auglaize", abbr: "AUGL" },
    { name: "Belmont", abbr: "BELM" },
    { name: "Brown", abbr: "BROW" },
    { name: "Butler", abbr: "BUTL" },
    { name: "Carroll", abbr: "CARR" },
    { name: "Champaign", abbr: "CHAM" },
    { name: "Clark", abbr: "CLAR" },
    { name: "Clermont", abbr: "CLER" },
    { name: "Clinton", abbr: "CLIN" },
    { name: "Columbiana", abbr: "COLM" },
    { name: "Coshocton", abbr: "COSH" },
    { name: "Crawford", abbr: "CRAW" },
    { name: "Cuyahoga", abbr: "CUYA" },
    { name: "Darke", abbr: "DARK" },
    { name: "Defiance", abbr: "DEFI" },
    { name: "Delaware", abbr: "DELA" },
    { name: "Erie", abbr: "ERIE" },
    { name: "Fairfield", abbr: "FAIR" },
    { name: "Fayette", abbr: "FAYE" },
    { name: "Franklin", abbr: "FRAN" },
    { name: "Fulton", abbr: "FULT" },
    { name: "Gallia", abbr: "GALL" },
    { name: "Geauga", abbr: "GEAU" },
    { name: "Greene", abbr: "GREE" },
    { name: "Guernsey", abbr: "GUER" },
    { name: "Hamilton", abbr: "HAMI" },
    { name: "Hancock", abbr: "HANC" },
    { name: "Hardin", abbr: "HARD" },
    { name: "Harrison", abbr: "HARR" },
    { name: "Henry", abbr: "HENR" },
    { name: "Highland", abbr: "HIGH" },
    { name: "Hocking", abbr: "HOCK" },
    { name: "Holmes", abbr: "HOLM" },
    { name: "Huron", abbr: "HURO" },
    { name: "Jackson", abbr: "JACK" },
    { name: "Jefferson", abbr: "JEFF" },
    { name: "Knox", abbr: "KNOX" },
    { name: "Lake", abbr: "LAKE" },
    { name: "Lawrence", abbr: "LAWR" },
    { name: "Licking", abbr: "LICK" },
    { name: "Logan", abbr: "LOGA" },
    { name: "Lorain", abbr: "LORA" },
    { name: "Lucas", abbr: "LUCA" },
    { name: "Madison", abbr: "MADI" },
    { name: "Mahoning", abbr: "MAHO" },
    { name: "Marion", abbr: "MARN" },
    { name: "Medina", abbr: "MEDI" },
    { name: "Meigs", abbr: "MEIG" },
    { name: "Mercer", abbr: "MERC" },
    { name: "Miami", abbr: "MIAM" },
    { name: "Monroe", abbr: "MONR" },
    { name: "Montgomery", abbr: "MGMY" },
    { name: "Morgan", abbr: "MORG" },
    { name: "Morrow", abbr: "MORR" },
    { name: "Muskingum", abbr: "MUSK" },
    { name: "Noble", abbr: "NOBL" },
    { name: "Ottawa", abbr: "OTTA" },
    { name: "Paulding", abbr: "PAUL" },
    { name: "Perry", abbr: "PERR" },
    { name: "Pickaway", abbr: "PICK" },
    { name: "Pike", abbr: "PIKE" },
    { name: "Portage", abbr: "PORT" },
    { name: "Preble", abbr: "PREB" },
    { name: "Putnam", abbr: "PUTN" },
    { name: "Richland", abbr: "RICH" },
    { name: "Ross", abbr: "ROSS" },
    { name: "Sandusky", abbr: "SAND" },
    { name: "Scioto", abbr: "SCIO" },
    { name: "Seneca", abbr: "SENE" },
    { name: "Shelby", abbr: "SHEL" },
    { name: "Stark", abbr: "STAR" },
    { name: "Summit", abbr: "SUMM" },
    { name: "Trumbull", abbr: "TRUM" },
    { name: "Tuscarawas", abbr: "TUSC" },
    { name: "Union", abbr: "UNIO" },
    { name: "Van Wert", abbr: "VANW" },
    { name: "Vinton", abbr: "VINT" },
    { name: "Warren", abbr: "WARR" },
    { name: "Washington", abbr: "WASH" },
    { name: "Wayne", abbr: "WAYN" },
    { name: "Williams", abbr: "WILL" },
    { name: "Wood", abbr: "WOOD" },
    { name: "Wyandot", abbr: "WYAN" },
  ],
};

// ============================================================================
// Lookup indexes (built lazily for performance)
// ============================================================================

/** Cached lookup maps: state -> abbr -> CountyEntry */
let _countyIndex: Record<string, Map<string, CountyEntry>> | null = null;

function getCountyIndex(): Record<string, Map<string, CountyEntry>> {
  if (!_countyIndex) {
    _countyIndex = {};
    for (const [state, counties] of Object.entries(COUNTY_DATA)) {
      const map = new Map<string, CountyEntry>();
      for (const county of counties) {
        map.set(county.abbr.toUpperCase(), county);
      }
      _countyIndex[state] = map;
    }
  }
  return _countyIndex;
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Check if a county abbreviation is valid for a given state
 *
 * @param state - 2-letter US state code (e.g., "CA", "TX")
 * @param abbr - County abbreviation to validate
 * @returns True if the abbreviation is a valid county for the state
 *
 * @example
 * ```ts
 * isValidCounty("CA", "ALAM")  // true (Alameda County, CA)
 * isValidCounty("CA", "XXXX")  // false
 * isValidCounty("NY", "ALAM")  // false (NY not in database)
 * ```
 */
export function isValidCounty(state: string, abbr: string): boolean {
  const index = getCountyIndex();
  const stateMap = index[state.toUpperCase()];
  if (!stateMap) {
    return false;
  }
  return stateMap.has(abbr.toUpperCase());
}

/**
 * Get the full county name for a state and abbreviation
 *
 * @param state - 2-letter US state code
 * @param abbr - County abbreviation
 * @returns Full county name, or null if not found
 *
 * @example
 * ```ts
 * getCountyName("CA", "ALAM")  // "Alameda"
 * getCountyName("TX", "HARR")  // "Harris"
 * getCountyName("CA", "XXXX")  // null
 * ```
 */
export function getCountyName(state: string, abbr: string): string | null {
  const index = getCountyIndex();
  const stateMap = index[state.toUpperCase()];
  if (!stateMap) {
    return null;
  }
  const entry = stateMap.get(abbr.toUpperCase());
  return entry ? entry.name : null;
}

/**
 * Get all county abbreviations for a state
 *
 * @param state - 2-letter US state code
 * @returns Array of county abbreviations, or empty array if state not in database
 */
export function getCountyAbbreviations(state: string): string[] {
  const counties = COUNTY_DATA[state.toUpperCase()];
  if (!counties) {
    return [];
  }
  return counties.map((c) => c.abbr);
}

/**
 * Get all states that have county data available
 *
 * @returns Array of state codes with county data
 */
export function getStatesWithCountyData(): string[] {
  return Object.keys(COUNTY_DATA);
}
