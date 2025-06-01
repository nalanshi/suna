'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Check, ChevronDown, Search, AlertTriangle, Crown, ArrowUpRight, Brain, Plus, Edit, Trash } from 'lucide-react';
import {
  ModelOption,
  SubscriptionStatus,
  STORAGE_KEY_MODEL,
  // STORAGE_KEY_CUSTOM_MODELS, // Will use saveCustomModels
  DEFAULT_FREE_MODEL_ID,
  DEFAULT_PREMIUM_MODEL_ID,
  formatModelName,
  getCustomModels,
  saveCustomModels, // Import saveCustomModels
  CustomModel as ImportedCustomModel, // Import CustomModel type
  MODELS // Import the centralized MODELS constant
} from './_use-model-selection';
import { PaywallDialog } from '@/components/payment/paywall-dialog';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { isLocalMode } from '@/lib/config'; // Keep for now, but remove its usage for custom models
import { CustomModelDialog, CustomModelFormData } from './custom-model-dialog';

// Use the imported CustomModel type
interface CustomModel extends ImportedCustomModel {}


interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  modelOptions: ModelOption[];
  canAccessModel: (modelId: string) => boolean;
  subscriptionStatus: SubscriptionStatus;
  refreshCustomModels?: () => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  modelOptions,
  canAccessModel,
  subscriptionStatus,
  refreshCustomModels,
}) => {
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [lockedModel, setLockedModel] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Custom models state
  const [customModels, setCustomModels] = useState<CustomModel[]>([]);
  const [isCustomModelDialogOpen, setIsCustomModelDialogOpen] = useState(false);
  const [dialogInitialData, setDialogInitialData] = useState<CustomModelFormData>({ id: '', label: '', apiKey: '', apiBase: '' });
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [editingModelId, setEditingModelId] = useState<string | null>(null);

  // Load custom models from localStorage on component mount
  useEffect(() => {
    // Always load custom models
    setCustomModels(getCustomModels());
  }, []);

  // Save custom models whenever they change
  useEffect(() => {
    // Always save custom models if they exist
    // This effect ensures that if customModels state is manipulated directly
    // (e.g. by an external tool or a bug), it still gets saved.
    // However, primary saves should happen in handleSaveCustomModel and handleDeleteCustomModel.
    if (customModels.length > 0) { // Only save if there's something to save
        saveCustomModels(customModels);
    }
  }, [customModels]);

  // Get current custom models from state
  const currentCustomModels = customModels || [];

  // Enhance model options with capabilities - using a Map to ensure uniqueness
  const modelMap = new Map();

  // First add all standard models to the map
  modelOptions.forEach(model => {
    modelMap.set(model.id, {
      ...model,
      isCustom: false
    });
  });

  // Then add custom models from the current customModels state
  // This ensures we're using the most up-to-date list of custom models
  // No isLocalMode() check here, custom models are always loaded if present
  currentCustomModels.forEach(model => {
    const modelToSet: ModelOption = {
      id: model.id,
      label: model.label || formatModelName(model.id),
      requiresSubscription: false, // Custom models don't require app subscription
      top: false,
      isCustom: true,
      // apiKey and apiBase are part of the CustomModel structure but not ModelOption
      // They are handled separately when a custom model is selected.
    };
    // Only add if it doesn't exist or mark it as a custom model if it does
    if (!modelMap.has(model.id)) {
      modelMap.set(model.id, modelToSet);
    } else {
      // If it already exists (e.g., a built-in model has the same ID),
      // prefer the custom model's definition for label and isCustom status.
      const existingModel = modelMap.get(model.id);
      modelMap.set(model.id, {
        ...existingModel,
        label: modelToSet.label, // Prefer custom label
        isCustom: true, // Mark as custom
      });
    }
  });

  // Convert map back to array
  const enhancedModelOptions = Array.from(modelMap.values());

  // Filter models based on search query
  const filteredOptions = enhancedModelOptions.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    opt.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get free models from modelOptions (helper function)
  const getFreeModels = () => modelOptions.filter(m => !m.requiresSubscription).map(m => m.id);

  // No sorting needed - models are already sorted in the hook
  const sortedModels = filteredOptions;

  // Simplified premium models function - just filter without sorting
  const getPremiumModels = () => {
    return modelOptions
      .filter(m => m.requiresSubscription)
      .map((m, index) => ({
        ...m,
        uniqueKey: getUniqueModelKey(m, index)
      }));
  }

  // Make sure model IDs are unique for rendering
  const getUniqueModelKey = (model: any, index: number): string => {
    return `model-${model.id}-${index}`;
  };

  // Map models to ensure unique IDs for React keys
  const uniqueModels = sortedModels.map((model, index) => ({
    ...model,
    uniqueKey: getUniqueModelKey(model, index)
  }));

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
      setHighlightedIndex(-1);
    }
  }, [isOpen]);

  const selectedLabel =
    enhancedModelOptions.find((o) => o.id === selectedModel)?.label || 'Select model';

  const handleSelect = (id: string) => {
    // Check if it's a custom model by looking at the enhanced options
    const selectedOption = enhancedModelOptions.find(opt => opt.id === id);
    const isCustomModel = selectedOption?.isCustom || false;

    // Custom models are always accessible (their own API keys are used)
    if (isCustomModel) {
      onModelChange(id);
      setIsOpen(false);
      return;
    }

    // For non-custom models, use the regular canAccessModel check
    if (canAccessModel(id)) {
      onModelChange(id);
      setIsOpen(false);
    } else {
      setLockedModel(id);
      setPaywallOpen(true);
    }
  };

  const handleUpgradeClick = () => {
    router.push('/settings/billing');
  };

  const closeDialog = () => {
    setPaywallOpen(false);
    setLockedModel(null);
  };

  const handleSearchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1
      );
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      const selectedOption = filteredOptions[highlightedIndex];
      if (selectedOption) {
        handleSelect(selectedOption.id);
      }
    }
  };

  const premiumModels = sortedModels.filter(m => !getFreeModels().some(id => m.id.includes(id)));

  const shouldDisplayAll = (!isLocalMode() && subscriptionStatus === 'no_subscription') && premiumModels.length > 0;

  // Handle opening the custom model dialog
  const openAddCustomModelDialog = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDialogInitialData({ id: '', label: '', apiKey: '', apiBase: '' });
    setDialogMode('add');
    setIsCustomModelDialogOpen(true);
    setIsOpen(false); // Close dropdown when opening modal
  };

  // Handle opening the edit model dialog
  const openEditCustomModelDialog = (modelId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const modelToEdit = customModels.find(m => m.id === modelId);
    if (!modelToEdit) return;

    setDialogInitialData({
      id: modelToEdit.id,
      label: modelToEdit.label,
      apiKey: modelToEdit.apiKey || '',
      apiBase: modelToEdit.apiBase || ''
    });
    setEditingModelId(modelToEdit.id);
    setDialogMode('edit');
    setIsCustomModelDialogOpen(true);
    setIsOpen(false); // Close dropdown when opening modal
  };

  // Handle saving a custom model
  const handleSaveCustomModel = (formData: CustomModelFormData) => {
    // Get model ID without automatically adding prefix
    const modelId = formData.id.trim();

    // Generate display name based on model ID (remove prefix if present for display name)
    const displayId = modelId.startsWith('openrouter/') ? modelId.replace('openrouter/', '') : modelId;
    const modelLabel = formData.label.trim() || formatModelName(displayId);

    if (!modelId) return;

    // Check for duplicates - only for new models or if ID changed during edit
    if (customModels.some(m => m.id === modelId && (dialogMode === 'add' || m.id !== editingModelId))) {
      console.error('A model with this ID already exists');
      // Optionally, show a toast or an error message to the user
      return;
    }

    // Create the new model object, now including apiKey and apiBase
    const newModel: CustomModel = {
      id: modelId,
      label: modelLabel,
      apiKey: formData.apiKey,
      apiBase: formData.apiBase
    };

    let updatedModels;
    if (dialogMode === 'add') {
      updatedModels = [...customModels, newModel];
    } else {
      updatedModels = customModels.map(m => (m.id === editingModelId ? newModel : m));
    }

    setCustomModels(updatedModels);
    saveCustomModels(updatedModels); // Use the imported save function

    if (refreshCustomModels) {
      refreshCustomModels(); // This might be redundant if customModels state is derived correctly
    }

    // Handle model selection changes
    // First, close the dialog to prevent UI issues
    closeCustomModelDialog(); // Moved up
    if (dialogMode === 'add') {
      // Always select newly added models
      onModelChange(modelId);
      // Also save the selection to localStorage
      try {
        localStorage.setItem(STORAGE_KEY_MODEL, modelId);
      } catch (error) {
        console.warn('Failed to save selected model to localStorage:', error);
      }
    } else if (selectedModel === editingModelId) {
      // For edits, only update if the edited model was selected
      onModelChange(modelId);
      try {
        localStorage.setItem(STORAGE_KEY_MODEL, modelId);
      } catch (error) {
        console.warn('Failed to save selected model to localStorage:', error);
      }
    }

    // Force dropdown to close to ensure fresh data on next open
    setIsOpen(false);

    // Force a UI refresh by delaying the state update
    setTimeout(() => {
      setHighlightedIndex(-1);
    }, 0);
  };

  // Handle closing the custom model dialog
  const closeCustomModelDialog = () => {
    setIsCustomModelDialogOpen(false);
    setDialogInitialData({ id: '', label: '', apiKey: '', apiBase: '' });
    setEditingModelId(null);

    // Improved fix for pointer-events issue: ensure dialog closes properly
    document.body.classList.remove('overflow-hidden');
    const bodyStyle = document.body.style;
    setTimeout(() => {
      bodyStyle.pointerEvents = '';
      bodyStyle.removeProperty('pointer-events');
    }, 150);
  };

  // Handle deleting a custom model
  const handleDeleteCustomModel = (modelId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();

    // Filter out the model to delete
    const updatedCustomModels = customModels.filter(m => m.id !== modelId);

    setCustomModels(updatedCustomModels);
    saveCustomModels(updatedCustomModels); // Use the imported save function

    if (refreshCustomModels) {
      refreshCustomModels(); // This might be redundant
    }

    if (selectedModel === modelId) {
      // Revert to a default model if the deleted one was selected
      const defaultModelId = subscriptionStatus === 'active' ? DEFAULT_PREMIUM_MODEL_ID : DEFAULT_FREE_MODEL_ID;
      onModelChange(defaultModelId);
      // Persist this change
      try {
        localStorage.setItem(STORAGE_KEY_MODEL, defaultModelId);
      } catch (error) {
        console.warn('Failed to save default model selection to localStorage:', error);
      }
    }

    // Force dropdown to close
    setIsOpen(false);
    // Ensure UI updates correctly after deletion
    setTimeout(() => setHighlightedIndex(-1), 0);
  };

  const renderModelOption = (opt: ModelOption, index: number) => {
    const isCustom = opt.isCustom || false; // Relies on enhancedModelOptions correctly setting this
    const accessible = isCustom ? true : canAccessModel(opt.id);

    // Fix the highlighting logic to use the index parameter instead of searching in filteredOptions
    const isHighlighted = index === highlightedIndex;
    const isPremium = opt.requiresSubscription;
    const isLowQuality = MODELS[opt.id]?.lowQuality || false;
    const isRecommended = MODELS[opt.id]?.recommended || false;

    return (
      <TooltipProvider key={opt.uniqueKey || `model-${opt.id}-${index}`}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className='w-full'>
              <DropdownMenuItem
                className={cn(
                  "text-sm px-3 py-2 mx-2 my-0.5 flex items-center justify-between cursor-pointer",
                  isHighlighted && "bg-accent",
                  !accessible && "opacity-70"
                )}
                onClick={() => handleSelect(opt.id)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <div className="flex items-center">
                  <span className="font-medium">{opt.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Show capabilities */}
                  {isLowQuality && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  )}
                  {isRecommended && (
                    <span className="text-xs px-1.5 py-0.5 rounded-sm bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 font-medium">
                      Recommended
                    </span>
                  )}
                  {isPremium && !accessible && (
                    <Crown className="h-3.5 w-3.5 text-blue-500" />
                  )}
                  {/* Custom model actions - remove isLocalMode() condition */}
                  {isCustom && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditCustomModelDialog(opt.id, e); // Pass ID to find full model data
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCustomModel(opt.id, e);
                        }}
                        className="text-muted-foreground hover:text-red-500"
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                  {selectedModel === opt.id && (
                    <Check className="h-4 w-4 text-blue-500" />
                  )}
                </div>
              </DropdownMenuItem>
            </div>
          </TooltipTrigger>
          {!accessible ? (
            <TooltipContent side="left" className="text-xs max-w-xs">
              <p>Requires subscription to access premium model</p>
            </TooltipContent>
          ) : isLowQuality ? (
            <TooltipContent side="left" className="text-xs max-w-xs">
              <p>Not recommended for complex tasks</p>
            </TooltipContent>
          ) : isRecommended ? (
            <TooltipContent side="left" className="text-xs max-w-xs">
              <p>Recommended for optimal performance</p>
            </TooltipContent>
          ) : isCustom ? (
            <TooltipContent side="left" className="text-xs max-w-xs">
              <p>Custom model</p>
            </TooltipContent>
          ) : null}
        </Tooltip>
      </TooltipProvider>
    );
  };

  // Update filtered options when customModels or search query changes
  useEffect(() => {
    // Force reset of enhancedModelOptions whenever customModels change
    // The next render will regenerate enhancedModelOptions with the updated modelMap
    setHighlightedIndex(-1);
    setSearchQuery('');

    // Force React to fully re-evaluate the component rendering
    if (isOpen) {
      // If dropdown is open, briefly close and reopen to force refresh
      setIsOpen(false);
      setTimeout(() => setIsOpen(true), 10);
    }
  }, [customModels, modelOptions, isOpen]); // Also depend on modelOptions to refresh when parent changes

  return (
    <div className="relative">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-8 rounded-lg text-muted-foreground shadow-none border-none focus:ring-0 px-3"
          >
            <div className="flex items-center gap-1 text-sm font-medium">
              {MODELS[selectedModel]?.lowQuality && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mr-1" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      <p>Basic model with limited capabilities</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <span className="truncate max-w-[100px] sm:max-w-[160px] md:max-w-[200px] lg:max-w-none">{selectedLabel}</span>
              <ChevronDown className="h-3 w-3 opacity-50 ml-1 flex-shrink-0" />
            </div>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-72 p-0 overflow-hidden"
          sideOffset={4}
        >
          <div className="overflow-y-auto w-full scrollbar-hide relative">
            {/* Completely separate views for subscribers and non-subscribers */}
            {shouldDisplayAll ? (
              /* No Subscription View */
              <div>
                {/* Available Models Section - ONLY hardcoded free models */}
                <div className="px-3 py-3 text-xs font-medium text-muted-foreground">
                  Available Models
                </div>
                {/* Only show free models */}
                {uniqueModels
                  .filter(m =>
                    !m.requiresSubscription &&
                    (m.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      m.id.toLowerCase().includes(searchQuery.toLowerCase()))
                  )
                  .map((model, index) => (
                    <TooltipProvider key={model.uniqueKey || `model-${model.id}-${index}`}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className='w-full'>
                            <DropdownMenuItem
                              className={cn(
                                "text-sm mx-2 my-0.5 px-3 py-2 flex items-center justify-between cursor-pointer",
                                selectedModel === model.id && "bg-accent"
                              )}
                              onClick={() => onModelChange(model.id)}
                              onMouseEnter={() => setHighlightedIndex(filteredOptions.indexOf(model))}
                            >
                              <div className="flex items-center">
                                <span className="font-medium">{model.label}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {/* Show capabilities */}
                                {(MODELS[model.id]?.lowQuality || false) && (
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                )}
                                {(MODELS[model.id]?.recommended || false) && (
                                  <span className="text-xs px-1.5 py-0.5 rounded-sm bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 font-medium">
                                    Recommended
                                  </span>
                                )}
                                {selectedModel === model.id && (
                                  <Check className="h-4 w-4 text-blue-500" />
                                )}
                              </div>
                            </DropdownMenuItem>
                          </div>
                        </TooltipTrigger>
                        {MODELS[model.id]?.lowQuality && (
                          <TooltipContent side="left" className="text-xs max-w-xs">
                            <p>Basic model with limited capabilities</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  ))
                }

                {/* Premium Models Section */}
                <div className="mt-4 border-t border-border pt-2">
                  <div className="px-3 py-1.5 text-xs font-medium text-blue-500 flex items-center">
                    <Crown className="h-3.5 w-3.5 mr-1.5" />
                    Premium Models
                  </div>

                  {/* Premium models container with paywall overlay */}
                  <div className="relative h-40 overflow-hidden px-2">
                    {getPremiumModels()
                      .filter(m =>
                        m.requiresSubscription &&
                        (m.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          m.id.toLowerCase().includes(searchQuery.toLowerCase()))
                      )
                      .slice(0, 3)
                      .map((model, index) => (
                        <TooltipProvider key={model.uniqueKey || `model-${model.id}-${index}`}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className='w-full'>
                                <DropdownMenuItem
                                  className="text-sm px-3 py-2 flex items-center justify-between opacity-70 cursor-pointer pointer-events-none"
                                >
                                  <div className="flex items-center">
                                    <span className="font-medium">{model.label}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {/* Show capabilities */}
                                    {MODELS[model.id]?.recommended && (
                                      <span className="text-xs px-1.5 py-0.5 rounded-sm bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 font-medium whitespace-nowrap">
                                        Recommended
                                      </span>
                                    )}
                                    <Crown className="h-3.5 w-3.5 text-blue-500" />
                                  </div>
                                </DropdownMenuItem>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs max-w-xs">
                              <p>Requires subscription to access premium model</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))
                    }

                    {/* Absolute positioned paywall overlay with gradient fade */}
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/95 to-transparent flex items-end justify-center">
                      <div className="w-full p-3">
                        <div className="rounded-xl bg-gradient-to-br from-blue-50/80 to-blue-200/70 dark:from-blue-950/40 dark:to-blue-900/30 shadow-sm border border-blue-200/50 dark:border-blue-800/50 p-3">
                          <div className="flex flex-col space-y-2">
                            <div className="flex items-center">
                              <Crown className="h-4 w-4 text-blue-500 mr-2 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium">Unlock all models + higher limits</p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              className="w-full h-8 font-medium"
                              onClick={handleUpgradeClick}
                            >
                              Upgrade now
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Subscription or other status view */
              <div className='max-h-[320px] overflow-y-auto w-full'>
                <div className="px-3 py-3 flex justify-between items-center">
                  <span className="text-xs font-medium text-muted-foreground">All Models</span>
                  {/* Remove isLocalMode() for Add Custom Model button */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAddCustomModelDialog(e);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Add a custom model
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {uniqueModels
                  .filter(m =>
                    m.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    m.id.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  // Sort to prioritize recommended paid models first
                  .sort((a, b) => {
                    const aRecommendedPaid = MODELS[a.id]?.recommended && a.requiresSubscription;
                    const bRecommendedPaid = MODELS[b.id]?.recommended && b.requiresSubscription;

                    if (aRecommendedPaid && !bRecommendedPaid) return -1;
                    if (!aRecommendedPaid && bRecommendedPaid) return 1;

                    // Secondary sorting: recommended free models next
                    const aRecommended = MODELS[a.id]?.recommended;
                    const bRecommended = MODELS[b.id]?.recommended;

                    if (aRecommended && !bRecommended) return -1;
                    if (!aRecommended && bRecommended) return 1;

                    // Paid models next
                    if (a.requiresSubscription && !b.requiresSubscription) return -1;
                    if (!a.requiresSubscription && b.requiresSubscription) return 1;

                    // Default to alphabetical order
                    return a.label.localeCompare(b.label);
                  })
                  .map((model, index) => renderModelOption(model, index))}

                {uniqueModels.length === 0 && (
                  <div className="text-sm text-center py-4 text-muted-foreground">
                    No models match your search
                  </div>
                )}
              </div>
            )}
          </div>
          {!shouldDisplayAll && <div className="px-3 py-2 border-t border-border">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchInputKeyDown}
                className="w-full h-8 px-8 py-1 rounded-lg text-sm focus:outline-none bg-muted"
              />
            </div>
          </div>}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Custom Model Dialog - moved to separate component */}
      <CustomModelDialog
        isOpen={isCustomModelDialogOpen}
        onClose={closeCustomModelDialog}
        onSave={handleSaveCustomModel}
        initialData={dialogInitialData}
        mode={dialogMode}
      />

      {paywallOpen && (
        <PaywallDialog
          open={true}
          onDialogClose={closeDialog}
          title="Premium Model"
          description={
            lockedModel
              ? `Subscribe to access ${modelOptions.find(
                (m) => m.id === lockedModel
              )?.label}`
              : 'Subscribe to access premium models with enhanced capabilities'
          }
          ctaText="Subscribe Now"
          cancelText="Maybe Later"
        />
      )}
    </div>
  );
};