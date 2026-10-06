import { Injectable, inject } from '@angular/core';
import { LookupValuesApi } from '@shared/lookups/lookup';
import type { ImportConfig } from '@shared/models/import';
import { firstValueFrom, forkJoin } from 'rxjs';
import { ContactApi, CustomerApi, DocumentApi, LookupApi, SiteApi } from './customer-site.api';
import {
  type ImportContext,
  contactImportConfig,
  customerImportConfig,
  documentImportConfig,
  siteImportConfig,
} from './import-configs';

export type ImportEntity = 'customers' | 'sites' | 'contacts' | 'documents';

/** Builds import configurations against fresh reference data (codes, customers, sites, users). */
@Injectable()
export class CustomerSiteImports {
  private readonly customers = inject(CustomerApi);
  private readonly sites = inject(SiteApi);
  private readonly contacts = inject(ContactApi);
  private readonly documents = inject(DocumentApi);
  private readonly lookups = inject(LookupApi);
  private readonly lookupValues = inject(LookupValuesApi);

  async config(entity: ImportEntity): Promise<ImportConfig> {
    const [customers, sites, lookups, lookupValues] = await firstValueFrom(
      forkJoin([this.customers.list(), this.sites.list(), this.lookups.get(), this.lookupValues.list()]),
    );
    const ctx: ImportContext = { customers, sites, lookups, lookupValues };
    switch (entity) {
      case 'customers':
        return customerImportConfig(ctx, this.customers);
      case 'sites':
        return siteImportConfig(ctx, this.sites);
      case 'contacts':
        return contactImportConfig(ctx, this.contacts);
      case 'documents':
        return documentImportConfig(ctx, this.documents);
    }
  }
}
