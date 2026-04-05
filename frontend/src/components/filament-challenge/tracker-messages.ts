import type { FilamentProject } from './filament-types';

type ThemeKey = 'home' | 'aviation' | 'friki' | 'generic';

export interface TrackerSuccessFeedback {
  message: string;
  milestone: number | null;
}

function detectTheme(project: FilamentProject): ThemeKey {
  const source = `${project.title} ${project.description}`.toLowerCase();

  if (/(hogar|casa|decoracion|decoración|cocina|baño|bano|salon|salón|mueble|organizador|jarron|jarrón|maceta|lampara|lámpara)/.test(source)) {
    return 'home';
  }

  if (/(avion|avión|aviones|aeronave|aeroplano|helicoptero|helicóptero|ala|jet|boeing|airbus|fighter|f-16|mig|hangar)/.test(source)) {
    return 'aviation';
  }

  if (/(friki|anime|manga|dragon ball|goku|harry potter|marvel|dc|star wars|pokemon|pokémon|videojuego|otaku|figura|totoro|sonic)/.test(source)) {
    return 'friki';
  }

  return 'generic';
}

const createMessages: Record<ThemeKey, string[]> = {
  home: [
    'Bien, una pieza más para dejar ese hogar impecable.',
    'Fantástico, otra solución para la casa registrada.',
    'Una mejora del hogar más y esa serie va tomando forma.',
  ],
  aviation: [
    'Excelente, otro vuelo completado en esta serie aérea.',
    'Una aeronave más registrada. Esto ya empieza a despegar de verdad.',
    'Genial, has añadido otra pieza de aviación al hangar.',
  ],
  friki: [
    'Bien, una figura friki más registrada.',
    'Una pieza friki más se suma a la colección.',
    'Menuda fantasía: tu universo friki acaba de crecer una pieza más.',
  ],
  generic: [
    'Bien, otra pieza más registrada.',
    'Excelente, el proyecto sigue avanzando a muy buen ritmo.',
    'Fantástico, has añadido una pieza más al tracker.',
  ],
};

const updateMessages: Record<ThemeKey, string[]> = {
  home: [
    'Perfecto, la pieza del hogar quedó actualizada.',
    'Perfecto, esa pieza para casa ya está ajustada como toca.',
  ],
  aviation: [
    'Perfecto, la pieza aérea quedó actualizada.',
    'Perfecto, ese componente del hangar ya está ajustado.',
  ],
  friki: [
    'Perfecto, tu pieza friki quedó actualizada.',
    'Perfecto, esa pieza del fandom ya está ajustada.',
  ],
  generic: [
    'Perfecto, la pieza quedó actualizada.',
    'Perfecto, los cambios del proyecto ya están guardados.',
  ],
};

const milestoneMessages: Record<number, Record<ThemeKey, string>> = {
  5: {
    home: '¡Cinco piezas ya! Ese hogar empieza a tomar forma de verdad.',
    aviation: '¡Cinco piezas en pista! Esto ya empieza a despegar como es debido.',
    friki: '¡Cinco piezas frikis! Ese universo ya empieza a ponerse serio.',
    generic: '¡Cinco piezas ya registradas! Vas con muy buen ritmo.',
  },
  10: {
    home: '¡Diez piezas para la casa! Menudo avance llevas ya.',
    aviation: '¡Diez piezas aéreas! Ese hangar ya impone respeto.',
    friki: '¡Diez piezas frikis! Esto ya parece una colección seria.',
    generic: '¡Diez piezas registradas! El proyecto ya tiene cuerpo.',
  },
  25: {
    home: '¡Veinticinco piezas! Esa serie del hogar ya va lanzada.',
    aviation: '¡Veinticinco piezas! Tu escuadrón impreso ya mete miedo.',
    friki: '¡Veinticinco piezas frikis! Esto ya es museo del fandom.',
    generic: '¡Veinticinco piezas! Estás construyendo algo grande de verdad.',
  },
  50: {
    home: '¡Cincuenta piezas! Ese proyecto doméstico ya está en otro nivel.',
    aviation: '¡Cincuenta piezas! Directo al salón de la fama aeronáutica.',
    friki: '¡Cincuenta piezas frikis! Ya has montado un universo entero.',
    generic: '¡Cincuenta piezas! Fantástico, esto ya es una auténtica pasada.',
  },
};

function pickMessage(messages: string[], indexSeed: number): string {
  return messages[indexSeed % messages.length];
}

export function getTrackerSuccessMessage(
  project: FilamentProject,
  action: 'create' | 'update',
  currentPieceCount: number,
): TrackerSuccessFeedback {
  const theme = detectTheme(project);

  if (action === 'create' && milestoneMessages[currentPieceCount]) {
    return {
      message: milestoneMessages[currentPieceCount][theme],
      milestone: currentPieceCount,
    };
  }

  return {
    message: action === 'create'
      ? pickMessage(createMessages[theme], currentPieceCount)
      : pickMessage(updateMessages[theme], currentPieceCount),
    milestone: null,
  };
}
