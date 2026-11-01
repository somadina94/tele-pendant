import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { LanguageSelect } from './LanguageSelect';
import { renderWithProviders } from '../test/render';

describe('LanguageSelect', () => {
  it('pins Spanish without a token or parent callback', () => {
    localStorage.clear();
    renderWithProviders(<LanguageSelect />);
    fireEvent.change(screen.getByLabelText('Language'), {
      target: { value: 'es' },
    });
    expect(screen.getByLabelText('Idioma')).toBeInTheDocument();
    expect(localStorage.getItem('accessToken')).toBeNull();
  });
});
