import { Component } from '@angular/core';
import { greeting } from '@app/shared/greeting';
import { environment } from '@env/environment';
import { formatName } from '@app/shared/format-name';

@Component({
  selector: 'app-root',
  template: `<p>{{ message }}</p><p>API: {{ apiUrl }}</p>`,
})
export class App {
  protected readonly message = greeting(formatName('Ada', 'Lovelace'));
  protected readonly apiUrl = environment.apiUrl;
}
