import {Injectable} from '@angular/core';
import 'rxjs/add/operator/toPromise';
import {ApiService} from './api.service';
import {Dictionary} from './dictionary';
import {GutterSums} from './gutter-sums';
import {FileIDDictionary} from './file-id-dictionary';

export const CONTEXT_ALL = {rendering: 'all', id: null};

@Injectable()
export class CodeService {

  constructor(private api: ApiService) {
  }

  getFiles(): Promise<FileDescription[]> {
    return this.api.getFileIDs()
      .then((ids: FileID[]) => Promise
        .all(ids.map(id => this.api.getFileDescription(id))));
  }

  getAllGutters(): Promise<FileIDDictionary<Gutter<any>[]>> {
    return this.api.getFileIDs()
      .then((ids: FileID[]) => Promise
        .all(ids.map(id => this.api.getGutters(id)))
        .then((gutters: Gutter<any>[][]) => this.zip(gutters, ids)));
  }

  getGutters(fileID: FileID): Promise<Gutter<any>[]> {
    return this.getAllGutters().then(all => all[fileID.toString()]);
  }

  getAvailableGutters(): Promise<Gutter<any>[]> {
    return this.api.getFileIDs()
      .then(ids => this.getGutters(ids[0]))
      .then((gs: Gutter<any>[]) => gs.sort((a, b) => a.name.localeCompare(b.name)));
  }

  getLineValues(fileID: FileID, line: number): Promise<LineValue[]> {
    return this.api.getLineValues(fileID, line);
  }

  getContexts(fileID: FileID, line: number): Promise<{ rendering, id }[]> {
    return this.getLineValues(fileID, line).then((lvs: LineValue[]) => this.getUniqueContexts(lvs));
  }

  getAllocationLocations(objectID: ObjectID): Promise<ContextSensitiveDescribedLocation[]> {
    return this.api.getAllocationLocations(objectID);
  }

  getCallLocations(objectID: ObjectID): Promise<ContextSensitiveDescribedLocation[]> {
    return this.api.getCallLocations(objectID);
  }

  getEventHandlerRegistrationLocations(objectID: ObjectID): Promise<ContextSensitiveDescribedLocation[]> {
    return this.api.getEventHandlerRegistrationLocations(objectID);
  }

  getRelatedLocation(locationID: LocationID, forwards: boolean
    , kind: RelatedLocationKind, intraprocedural: boolean): Promise<DescribedLocation[]> {
    return this.api.getRelatedLocation(locationID, forwards, kind, intraprocedural);
  }

  getPositionalLocationID(fileID: FileID, line: number, column: number, contextID?: ContextID): Promise<Optional<DescribedLocation>> {
    return this.api.getPositionalLocationID(fileID, line, column, contextID);
  }

  getObjectProperties(objectID: ObjectID, locationID: LocationID): Promise<DescribedProperties> {
    return this.api.getObjectProperties(objectID, locationID);
  }

  getFilteredContexts(locationID: LocationID, expression: string): Promise<DescribedContext[]> {
    return this.api.getFilteredContexts(locationID, expression);
  }

  getEnclosingFunction(locationID: LocationID): Promise<ObjectID[]> {
    return this.api.getEnclosingFunction(locationID);
  }

  private getUniqueContexts(lineValues: LineValue[]): DescribedContext[] {
    const res: DescribedContext[] = [];

    res.push(CONTEXT_ALL);
    lineValues.forEach(value => {
      if (!value.location.hasOwnProperty('context')) {
        return;
      }
      if (res.find(c => c.id === value.location['context']['id'])) {
        return;
      }
      res.push(value.location['context']);
    });

    return res;
  }

  getSortedLineData(): Promise<Dictionary<[{ fileID: string, line: number, value: number }]>> {
    return this.getAllGutters().then((dictionary: FileIDDictionary<Gutter<any>[]>) => this.sortLines(dictionary));
  }

  getSums(gutters: string[]): Promise<GutterSums[]> {
    let allGutters;
    let fileNames;
    const promises = [];
    promises.push(this.getAllGutters().then(l => allGutters = l));
    promises.push(this.getFileNames().then(ns => fileNames = ns));
    return Promise.all(promises).then(() => this.calculatePropertySums(gutters, allGutters, fileNames));
  }

  getOptionData(): Promise<OptionData> {
    return this.api.getOptionData();
  }

  private getFileNames(): Promise<FileIDDictionary<string>> {
    return this.getFiles().then((files: FileDescription[]) => {
      const res = {};
      files.forEach(f => res[f.id.toString()] = f.name);
      return res;
    });
  }

  private calculatePropertySums(gutters: string[], dictionary: FileIDDictionary<Gutter<any>[]>
    , fileNames: FileIDDictionary<string>): GutterSums[] {
    const res = [];
    Object.keys(dictionary).forEach(fileID => {
      const temp = {};
      dictionary[fileID].filter(g => gutters.indexOf(g.name) !== -1)
        .forEach(gutter => {
          Object.keys(gutter.data.data).forEach(line => {
            const prop = gutter.name;
            const value = gutter.data.data[line];

            if (!temp[prop]) {
              temp[prop] = 0;
            }
            if (typeof value === 'number') {
              temp[prop] += value;
            }
          })
        });
      res.push({fileID: fileID, name: fileNames[fileID], sums: temp});
    });
    return res;
  }

  private zip(gutters: Gutter<any>[][], fileIDs: FileID[]): FileIDDictionary<Gutter<any>[]> {
    const res = {};
    fileIDs.forEach((fileID, i) => res[fileID.toString()] = gutters[i]);
    return res;
  }

  private sortLines(dictionary: FileIDDictionary<Gutter<any>[]>): { [property: string]: [{ fileID: string, line: number
    , value: number }] } {
    const temp = {};
    Object.keys(dictionary).forEach(fileID => {
      dictionary[fileID].forEach(gutter => {
        Object.keys(gutter.data.data).forEach(line => {
          const prop = gutter.name;
          const value = gutter.data.data[line];

          if (!temp[prop]) {
            temp[prop] = [];
          }
          temp[prop].push({fileID: fileID, line: line, value: value});
        });
      })
    });

    Object.keys(temp).forEach(property => temp[property].sort((o1, o2) => o2.value - o1.value));
    return temp;
  }
}
