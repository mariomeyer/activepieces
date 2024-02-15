import { Store } from '@ngrx/store';
import {
  combineLatest,
  debounceTime,
  filter,
  forkJoin,
  map,
  Observable,
  startWith,
  Subject,
  switchMap,
  take,
  tap,
} from 'rxjs';

import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  Trigger,
  ActionType,
  TriggerType,
  AddActionRequest,
  FlowVersion,
  StepLocationRelativeToParent,
  TelemetryEventName,
  flowHelper,
  PieceType,
  PackageType,
  ApFlagId,
} from '@activepieces/shared';
import { FormControl } from '@angular/forms';
import {
  BuilderSelectors,
  canvasActions,
  CanvasActionType,
  CodeService,
  FlowsActions,
  NO_PROPS,
  RightSideBarType,
  StepTypeSideBarProps,
} from '@activepieces/ui/feature-builder-store';
import {
  FlagService,
  FlowItemDetails,
  getDefaultDisplayNameForPiece,
  getDisplayNameForTrigger,
  PieceMetadataModelSummary,
  TelemetryService,
} from '@activepieces/ui/common';
import { Actions, ofType } from '@ngrx/effects';
import { PieceMetadataService } from '@activepieces/ui/feature-pieces';
type ActionOrTriggerName = {
  name: string;
  displayName: string;
};
@Component({
  selector: 'app-step-type-sidebar',
  templateUrl: './step-type-sidebar.component.html',
  styleUrls: ['./step-type-sidebar.component.scss'],
})
export class StepTypeSidebarComponent implements OnInit, AfterViewInit {
  @ViewChild('searchInput') searchInput: ElementRef;
  _showTriggers = false;
  searchFormControl = new FormControl('');
  focusSearchInput$: Observable<void>;
  //EE
  searchControlTelemetry$: Observable<void>;
  //EE end
  showRequestPiece$: Observable<boolean>;
  loading$ = new Subject<boolean>();
  @Input() set showTriggers(shouldShowTriggers: boolean) {
    this._showTriggers = shouldShowTriggers;
    if (this._showTriggers) {
      this.sideBarDisplayName = $localize`Select Trigger`;
    } else {
      this.sideBarDisplayName = $localize`Select Step`;
    }
    this.populateTabsAndTheirLists();
  }

  sideBarDisplayName = $localize`Select Step`;
  tabsAndTheirLists: {
    displayName: string;
    list$: Observable<FlowItemDetails[]>;
    emptyListText: string;
  }[] = [];
  flowTypeSelected$: Observable<void>;
  flowItemDetailsLoaded$: Observable<boolean>;
  triggersDetails$: Observable<FlowItemDetails[]>;
  constructor(
    private store: Store,
    private codeService: CodeService,
    private actions: Actions,
    private flagsService: FlagService,
    private telemetryService: TelemetryService,
    private pieceMetadataService: PieceMetadataService
  ) {
    this.focusSearchInput$ = this.actions.pipe(
      ofType(CanvasActionType.SET_RIGHT_SIDEBAR),
      tap(() => {
        this.searchInput?.nativeElement.focus();
      }),
      map(() => void 0)
    );
    this.showRequestPiece$ = this.flagsService.isFlagEnabled(
      ApFlagId.SHOW_COMMUNITY
    );
    //EE
    this.searchControlTelemetry$ = this.searchFormControl.valueChanges.pipe(
      debounceTime(1500),
      filter((val) => !!val),
      switchMap((val) => {
        this.telemetryService.capture({
          name: TelemetryEventName.PIECES_SEARCH,
          payload: {
            target: this._showTriggers ? 'triggers' : 'steps',
            search: val || '',
          },
        });
        return this.telemetryService.savePiecesSearch({
          target: this._showTriggers ? 'triggers' : 'steps',
          search: val || '',
          insideTemplates: false,
        });
      }),
      map(() => void 0)
    );
    //EE end
  }

  ngOnInit(): void {
    this.flowItemDetailsLoaded$ = this.store
      .select(BuilderSelectors.selectAllFlowItemsDetailsLoadedState)
      .pipe(tap(console.log));
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.searchInput?.nativeElement.focus();
    }, 350);
  }

  populateTabsAndTheirLists() {
    this.searchFormControl.setValue(this.searchFormControl.value, {
      emitEvent: false,
    });
    this.tabsAndTheirLists = [];
    const coreItemsDetails$ = this._showTriggers
      ? this.store.select(BuilderSelectors.selectFlowItemDetailsForCoreTriggers)
      : this.store.select(BuilderSelectors.selectCoreFlowItemsDetails);
    const customPiecesItemDetails$ = this._showTriggers
      ? this.store.select(
          BuilderSelectors.selectFlowItemDetailsForCustomPiecesTriggers
        )
      : this.store.select(
          BuilderSelectors.selectFlowItemDetailsForCustomPiecesActions
        );

    const allItemDetails$ = forkJoin({
      apps: customPiecesItemDetails$.pipe(take(1)),
      core: coreItemsDetails$.pipe(take(1)),
    }).pipe(
      map((res) => {
        return [...res.core, ...res.apps].sort((a, b) =>
          a.name > b.name ? 1 : -1
        );
      })
    );
    this.tabsAndTheirLists.push({
      displayName: $localize`All`,
      list$: this.applySearchToObservable(allItemDetails$),
      emptyListText: $localize`Oops! We didn't find any results.`,
    });

    this.tabsAndTheirLists.push({
      displayName: $localize`Core`,
      list$: this.applySearchToObservable(coreItemsDetails$),
      emptyListText: $localize`Oops! We didn't find any results.`,
    });

    this.tabsAndTheirLists.push({
      displayName: this._showTriggers
        ? $localize`App Events`
        : $localize`App Actions`,
      list$: this.applySearchToObservable(customPiecesItemDetails$),
      emptyListText: $localize`Oops! We didn't find any results.`,
    });
  }

  closeSidebar() {
    this.store.dispatch(
      canvasActions.setRightSidebar({
        sidebarType: RightSideBarType.NONE,
        props: NO_PROPS,
        deselectCurrentStep: true,
      })
    );
  }

  onTypeSelected(flowItemDetails: FlowItemDetails) {
    this.flowTypeSelected$ = forkJoin({
      currentFlow: this.store
        .select(BuilderSelectors.selectCurrentFlow)
        .pipe(take(1)),
      rightSideBar: this.store
        .select(BuilderSelectors.selectCurrentRightSideBar)
        .pipe(take(1)),
      currentStep: this.store
        .select(BuilderSelectors.selectCurrentStep)
        .pipe(take(1)),
    }).pipe(
      take(1),
      tap((results) => {
        if (!results.currentFlow) {
          return;
        }
        if (this._showTriggers) {
          this.replaceTrigger(flowItemDetails);
        } else {
          const operation = this.constructAddOperation(
            (results.rightSideBar.props as StepTypeSideBarProps).stepName,
            results.currentFlow.version,
            flowItemDetails.type as ActionType,
            flowItemDetails,
            (results.rightSideBar.props as StepTypeSideBarProps)
              .stepLocationRelativeToParent
          );
          this.store.dispatch(
            FlowsActions.addAction({
              operation: operation,
            })
          );
        }
      }),
      map(() => {
        return void 0;
      })
    );
  }

  private replaceTrigger(triggerDetails: FlowItemDetails) {
    const base = {
      name: 'trigger',
      nextAction: undefined,
      displayName: getDisplayNameForTrigger(triggerDetails.type as TriggerType),
    };
    let trigger: Trigger;
    switch (triggerDetails.type as TriggerType) {
      case TriggerType.EMPTY:
        trigger = {
          ...base,
          valid: false,
          type: TriggerType.EMPTY,
          settings: undefined,
        };
        break;
      case TriggerType.WEBHOOK:
        trigger = {
          ...base,
          valid: true,
          type: TriggerType.WEBHOOK,
          settings: {
            inputUiInfo: { currentSelectedData: '' },
          },
        };
        break;
      case TriggerType.PIECE:
        trigger = {
          ...base,
          type: TriggerType.PIECE,
          valid: false,
          settings: {
            packageType:
              triggerDetails.extra?.packageType ?? PackageType.REGISTRY,
            pieceType: triggerDetails.extra?.pieceType ?? PieceType.OFFICIAL,
            pieceName: triggerDetails.extra?.pieceName ?? 'NO_APP_NAME',
            pieceVersion:
              triggerDetails.extra?.pieceVersion ?? 'NO_APP_VERSION',
            triggerName: '',
            input: {},
            inputUiInfo: {
              currentSelectedData: '',
            },
          },
        };
        break;
    }
    this.store.dispatch(
      FlowsActions.updateTrigger({
        operation: trigger,
      })
    );
  }

  constructAddOperation(
    parentStep: string,
    flowVersion: FlowVersion,
    actionType: ActionType,
    flowItemDetails: FlowItemDetails,
    stepLocationRelativeToParent: StepLocationRelativeToParent
  ): AddActionRequest {
    const baseProps = {
      name: flowHelper.findAvailableStepName(flowVersion, 'step'),
      displayName: getDefaultDisplayNameForPiece(
        flowItemDetails.type as ActionType,
        flowItemDetails.name
      ),
      nextAction: undefined,
      valid: true,
    };
    switch (actionType) {
      case ActionType.CODE: {
        return {
          parentStep: parentStep,
          stepLocationRelativeToParent: stepLocationRelativeToParent,
          action: {
            ...baseProps,
            type: ActionType.CODE,
            settings: {
              sourceCode: this.codeService.helloWorldArtifact(),
              input: {},
              errorHandlingOptions: {
                continueOnFailure: {
                  value: false,
                },
                retryOnFailure: {
                  value: false,
                },
              },
            },
          },
        };
      }
      case ActionType.LOOP_ON_ITEMS: {
        return {
          parentStep: parentStep,
          stepLocationRelativeToParent: stepLocationRelativeToParent,
          action: {
            ...baseProps,
            type: ActionType.LOOP_ON_ITEMS,
            settings: {
              items: '',
              inputUiInfo: {},
            },
            valid: false,
          },
        };
      }
      case ActionType.PIECE: {
        return {
          parentStep: parentStep,
          stepLocationRelativeToParent: stepLocationRelativeToParent,
          action: {
            ...baseProps,
            type: ActionType.PIECE,
            valid: false,
            settings: {
              packageType:
                flowItemDetails.extra?.packageType ?? PackageType.REGISTRY,
              pieceType: flowItemDetails.extra?.pieceType ?? PieceType.OFFICIAL,
              pieceName: flowItemDetails.extra?.pieceName ?? 'NO_APP_NAME',
              pieceVersion:
                flowItemDetails.extra?.pieceVersion ?? 'NO_APP_VERSION',
              actionName: undefined,
              input: {},
              inputUiInfo: {
                customizedInputs: {},
              },
              errorHandlingOptions: {
                continueOnFailure: {
                  value: false,
                },
                retryOnFailure: {
                  value: false,
                },
              },
            },
          },
        };
      }
      case ActionType.BRANCH: {
        return {
          parentStep: parentStep,
          stepLocationRelativeToParent: stepLocationRelativeToParent,
          action: {
            ...baseProps,
            valid: false,
            type: ActionType.BRANCH,
            settings: {
              conditions: [
                [
                  {
                    firstValue: '',
                    secondValue: '',
                    operator: undefined,
                  },
                ],
              ],
              inputUiInfo: {},
            },
          },
        };
      }
    }
  }

  applySearchToObservable(
    tabItems$: Observable<FlowItemDetails[]>
  ): Observable<FlowItemDetails[]> {
    this.loading$.next(true);
    return combineLatest({
      allTabItems: tabItems$,
      search: this.searchFormControl.valueChanges.pipe(
        startWith(this.searchFormControl.value),
        tap(() => {
          this.loading$.next(true);
        }),
        debounceTime(300),
        map((search) => (search ? search : '')),
        switchMap((searchQuery) => {
          return this.createSearchRequest(searchQuery);
        })
      ),
    }).pipe(
      map((res) => {
        const matches = this.searchForMatchingFlowItemDetails(
          res.search.searchQuery,
          res.allTabItems,
          res.search.serverResponse
        );
        const matchesWithTriggersOrActions = this.showActionsOrTriggers(
          matches,
          res.search.serverResponse,
          res.search.searchQuery
        );
        //sort by the order of the server response
        return matchesWithTriggersOrActions.sort((a, b) => {
          const aIndex = res.search.serverResponse.findIndex(
            (p) => p.displayName === a.name
          );
          const bIndex = res.search.serverResponse.findIndex(
            (p) => p.displayName === b.name
          );
          if (aIndex === -1) {
            return 1;
          }
          if (bIndex === -1) {
            return 1;
          }
          return aIndex - bIndex;
        });
      }),

      tap(() => {
        this.loading$.next(false);
      })
    );
  }

  private createSearchRequest(searchQuery: string) {
    const serverRequestToSearchForPiece$ =
      this.pieceMetadataService.getPiecesManifestFromServer({
        includeHidden: false,
        searchQuery,
      });
    return serverRequestToSearchForPiece$.pipe(
      map((res) => {
        return {
          searchQuery,
          serverResponse: res,
        };
      })
    );
  }
  /**Need to search for core steps like webhook,loop,branch and code */
  private searchForMatchingFlowItemDetails(
    searchQuery: string,
    allTabItems: FlowItemDetails[],
    serverResponse: PieceMetadataModelSummary[]
  ) {
    return allTabItems.filter(
      (item) =>
        item.description
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase()) ||
        item.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        serverResponse.findIndex((p) => p.displayName === item.name) > -1
    );
  }
  private showActionsOrTriggers(
    searchResult: FlowItemDetails[],
    serverResponse: PieceMetadataModelSummary[],
    searchQuery: string
  ) {
    return searchResult.map((item) => {
      const serverResult = serverResponse.find((it) => {
        return it.displayName === item.name;
      });
      if (
        !serverResult ||
        !serverResult.actions ||
        !serverResult.triggers ||
        searchQuery.length < 3
      ) {
        return {
          ...item,
          actionsOrTriggers: [] as ActionOrTriggerName[],
        };
      }

      return {
        ...item,
        actionsOrTriggers: this._showTriggers
          ? serverResult.triggers
          : serverResult.actions,
      };
    });
  }
}
